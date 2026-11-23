const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// 1. Serve static frontend files from public/ directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper: 12-hour formatted server timestamp (e.g., "5:04 PM")
function getFormattedTimestamp() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// 5. Helper: Retrieve active users in a room via Socket.io adapter map
function getRoomUsers(room) {
  const roomSockets = io.sockets.adapter.rooms.get(room);
  if (!roomSockets) return [];

  const users = [];
  for (const socketId of roomSockets) {
    const clientSocket = io.sockets.sockets.get(socketId);
    if (clientSocket && clientSocket.data && clientSocket.data.username) {
      users.push({
        id: socketId,
        username: clientSocket.data.username
      });
    }
  }
  return users;
}

// Socket.IO connection and event handling
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 2. 'join-room' event
  socket.on('join-room', ({ username, room }) => {
    const cleanUsername = (username || '').trim() || `User_${socket.id.substring(0, 4)}`;
    const cleanRoom = (room || '').trim() || 'general';

    const oldRoom = socket.data.room;

    // Cleanly leave old room if switching rooms
    if (oldRoom && oldRoom !== cleanRoom) {
      socket.leave(oldRoom);
      socket.to(oldRoom).emit('system-message', {
        id: crypto.randomUUID(),
        room: oldRoom,
        text: `${socket.data.username} left the room.`,
        timestamp: getFormattedTimestamp()
      });
      io.to(oldRoom).emit('room-users', {
        room: oldRoom,
        users: getRoomUsers(oldRoom)
      });
      console.log(`[Room Switch] ${socket.data.username} left "${oldRoom}"`);
    }

    // Join new room
    socket.join(cleanRoom);
    socket.data.username = cleanUsername;
    socket.data.room = cleanRoom;

    console.log(`[Room Joined] User "${cleanUsername}" joined room "${cleanRoom}" (Socket: ${socket.id})`);

    // Welcome current user
    socket.emit('system-message', {
      id: crypto.randomUUID(),
      room: cleanRoom,
      text: `Welcome to "${cleanRoom}", ${cleanUsername}!`,
      timestamp: getFormattedTimestamp()
    });

    // Notify others in that room
    socket.to(cleanRoom).emit('system-message', {
      id: crypto.randomUUID(),
      room: cleanRoom,
      text: `${cleanUsername} has joined the room.`,
      timestamp: getFormattedTimestamp()
    });

    // Broadcast updated user roster to everyone in the room
    io.to(cleanRoom).emit('room-users', {
      room: cleanRoom,
      users: getRoomUsers(cleanRoom)
    });
  });

  // 3. 'chat-message' event: strict room isolation
  socket.on('chat-message', (data) => {
    const currentRoom = socket.data.room;
    const currentUsername = socket.data.username;

    if (!currentRoom) {
      socket.emit('system-message', {
        id: crypto.randomUUID(),
        text: 'Error: You must join a room before sending messages.',
        timestamp: getFormattedTimestamp()
      });
      return;
    }

    const messageText = typeof data === 'string' ? data : (data && data.text ? data.text : '');
    const cleanText = messageText.trim();

    if (!cleanText) return;

    const payload = {
      id: crypto.randomUUID(),
      sender: currentUsername || 'Anonymous',
      room: currentRoom,
      text: cleanText,
      timestamp: getFormattedTimestamp()
    };

    // Strictly broadcast to everyone in that room
    io.to(currentRoom).emit('chat-message', payload);
    console.log(`[Message in "${currentRoom}"] ${payload.sender}: ${payload.text}`);
  });

  // 4. 'disconnect' event
  socket.on('disconnect', () => {
    const room = socket.data.room;
    const username = socket.data.username;

    console.log(`[Socket Disconnected] ID: ${socket.id} (${username || 'Unregistered'} in "${room || 'None'}")`);

    if (room && username) {
      // Notify remaining room members
      socket.to(room).emit('system-message', {
        id: crypto.randomUUID(),
        room: room,
        text: `${username} has left the chat.`,
        timestamp: getFormattedTimestamp()
      });

      // Update room users for remaining members
      io.to(room).emit('room-users', {
        room: room,
        users: getRoomUsers(room)
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
