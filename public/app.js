/**
 * Client-side Real-time Chat Controller
 */
(() => {
  // Socket.IO instance
  const socket = io({ autoConnect: true });

  // DOM Elements - Screens
  const lobbyScreen = document.getElementById('lobby-screen');
  const chatScreen = document.getElementById('chat-screen');

  // DOM Elements - Lobby Form & Tags
  const joinForm = document.getElementById('join-form');
  const usernameInput = document.getElementById('username-input');
  const roomInput = document.getElementById('room-input');
  const roomTags = document.querySelectorAll('.room-tag');

  // DOM Elements - Chat Header & Meta
  const activeRoomTitle = document.getElementById('active-room-title');
  const activeUsersCount = document.getElementById('active-users-count');
  const currentUserDisplay = document.getElementById('current-user-display');
  const userAvatarLetter = document.getElementById('user-avatar-letter');
  const leaveBtn = document.getElementById('leave-btn');

  // DOM Elements - Messages & Input
  const messagesContainer = document.getElementById('messages-container');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');

  // Current session state
  let currentUsername = '';
  let currentRoom = '';

  /**
   * Sanitize text against XSS attacks
   * @param {string} str - Raw user input
   * @returns {string} - Escaped safe HTML string
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Auto-scroll message stream to the newest message
   */
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Switch between Lobby and Chat screens smoothly without page refresh
   * @param {'lobby'|'chat'} screenName
   */
  function showScreen(screenName) {
    if (screenName === 'chat') {
      lobbyScreen.classList.add('hidden');
      chatScreen.classList.remove('hidden');
      messageInput.focus();
    } else {
      chatScreen.classList.add('hidden');
      lobbyScreen.classList.remove('hidden');
      usernameInput.focus();
    }
  }

  /**
   * Handle quick-select room tags
   */
  roomTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const selectedRoom = tag.getAttribute('data-room');
      roomInput.value = selectedRoom;
      roomInput.focus();
    });
  });

  /**
   * Join Room Form Submit
   */
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const room = roomInput.value.trim().toLowerCase();

    if (!username || !room) return;

    currentUsername = username;
    currentRoom = room;

    // Update Header UI
    activeRoomTitle.textContent = `#${room}`;
    currentUserDisplay.textContent = username;
    userAvatarLetter.textContent = username.charAt(0).toUpperCase();

    // Clear previous messages
    messagesContainer.innerHTML = '';

    // Emit 'join-room' to server
    socket.emit('join-room', { username, room });

    // Transition smoothly to Chat Screen
    showScreen('chat');
  });

  /**
   * Leave Room Button
   */
  leaveBtn.addEventListener('click', () => {
    // Return to Lobby Screen smoothly
    showScreen('lobby');

    // Reset current room tracking
    currentRoom = '';
    messagesContainer.innerHTML = '';

    // Reconnect socket cleanly to remove from previous rooms and stop listening
    socket.disconnect();
    socket.connect();
  });

  /**
   * Send Message Form Submit
   */
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const text = messageInput.value.trim();
    if (!text || !currentRoom) return;

    // Emit chat-message to server
    socket.emit('chat-message', { text });

    // Clear input and refocus
    messageInput.value = '';
    messageInput.focus();
  });

  /**
   * Render Incoming / Outgoing Chat Message
   * @param {Object} payload - { id, sender, room, text, timestamp }
   */
  function appendChatMessage(payload) {
    const isSelf = payload.sender === currentUsername;
    const safeText = escapeHtml(payload.text);
    const safeSender = escapeHtml(payload.sender);
    const safeTime = escapeHtml(payload.timestamp);

    const messageRow = document.createElement('div');
    messageRow.className = `message-row ${isSelf ? 'message-self' : 'message-other'}`;

    if (isSelf) {
      messageRow.innerHTML = `
        <div class="bubble-body">
          <div class="msg-text">${safeText}</div>
          <div class="msg-meta">${safeTime}</div>
        </div>
      `;
    } else {
      messageRow.innerHTML = `
        <div class="bubble-body">
          <div class="sender-label">${safeSender}</div>
          <div class="msg-text">${safeText}</div>
          <div class="msg-meta">${safeTime}</div>
        </div>
      `;
    }

    messagesContainer.appendChild(messageRow);
    scrollToBottom();
  }

  /**
   * Render System Notification Message
   * @param {Object} payload - { id, text, timestamp }
   */
  function appendSystemMessage(payload) {
    const safeText = escapeHtml(payload.text);
    const safeTime = escapeHtml(payload.timestamp || '');

    const systemRow = document.createElement('div');
    systemRow.className = 'message-row system-row';
    systemRow.innerHTML = `
      <div class="system-pill">
        <span>${safeText}</span>
        ${safeTime ? `<span class="system-time">${safeTime}</span>` : ''}
      </div>
    `;

    messagesContainer.appendChild(systemRow);
    scrollToBottom();
  }

  /* ==========================================================================
     Socket.IO Event Listeners
     ========================================================================== */

  // 1. Listen for user chat messages
  socket.on('chat-message', (payload) => {
    appendChatMessage(payload);
  });

  // 2. Listen for system messages (join, leave, welcome)
  socket.on('system-message', (payload) => {
    appendSystemMessage(payload);
  });

  // 3. Listen for room users update
  socket.on('room-users', (data) => {
    if (data && Array.isArray(data.users)) {
      const count = data.users.length;
      activeUsersCount.textContent = `${count} ${count === 1 ? 'user' : 'users'} online`;
    }
  });

  // Handle reconnects
  socket.on('connect', () => {
    // If reconnecting while already in a room, re-join
    if (currentRoom && currentUsername) {
      socket.emit('join-room', { username: currentUsername, room: currentRoom });
    }
  });
})();
