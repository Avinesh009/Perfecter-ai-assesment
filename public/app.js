/**
 * Client-side Real-time Chat Controller with Typing & Audio Chime
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
  const muteBtn = document.getElementById('mute-btn');
  const muteIcon = document.getElementById('mute-icon');

  // DOM Elements - Messages & Typing Indicator
  const messagesContainer = document.getElementById('messages-container');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');

  // Session State
  let currentUsername = '';
  let currentRoom = '';
  let isTyping = false;
  let typingDebounceTimer = null;
  const activeTypers = new Set();

  // Audio State & Web Audio API
  let audioCtx = null;
  let isMuted = false;

  /**
   * Lazily initialize and resume the Web Audio API context
   */
  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  /**
   * Synthesize a gentle two-tone harmonic chime using Web Audio API oscillators
   * (Zero external MP3/WAV dependencies)
   */
  function playHarmonicChime() {
    if (isMuted) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.06, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      // Note 2: A5 (880.00 Hz) - pleasant melodic resolution
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.1);
      gain2.gain.setValueAtTime(0.06, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.38);
    } catch (err) {
      console.warn('Audio chime playback notice:', err);
    }
  }

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
   * Update the visual typing banner based on active typers set
   */
  function updateTypingBanner() {
    if (activeTypers.size === 0) {
      typingIndicator.classList.add('hidden');
      typingText.textContent = '';
      return;
    }

    const typersArray = Array.from(activeTypers);
    let label = '';
    if (typersArray.length === 1) {
      label = `${typersArray[0]} is typing...`;
    } else if (typersArray.length === 2) {
      label = `${typersArray[0]} and ${typersArray[1]} are typing...`;
    } else {
      label = `${typersArray[0]} and ${typersArray.length - 1} others are typing...`;
    }

    typingText.textContent = label;
    typingIndicator.classList.remove('hidden');
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
   * Mute / Unmute Audio Toggle
   */
  muteBtn.addEventListener('click', () => {
    initAudio();
    isMuted = !isMuted;
    muteIcon.textContent = isMuted ? '🔕' : '🔔';
    muteBtn.title = isMuted ? 'Notification sounds muted' : 'Notification sounds enabled';
  });

  /**
   * Join Room Form Submit
   */
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Unlock audio context on user interaction
    initAudio();

    const username = usernameInput.value.trim();
    const room = roomInput.value.trim().toLowerCase();

    if (!username || !room) return;

    currentUsername = username;
    currentRoom = room;

    // Update Header UI
    activeRoomTitle.textContent = `#${room}`;
    currentUserDisplay.textContent = username;
    userAvatarLetter.textContent = username.charAt(0).toUpperCase();

    // Clear previous room state
    messagesContainer.innerHTML = '';
    activeTypers.clear();
    updateTypingBanner();

    // Emit 'join-room' to server
    socket.emit('join-room', { username, room });

    // Transition smoothly to Chat Screen
    showScreen('chat');
  });

  /**
   * Leave Room Button
   */
  leaveBtn.addEventListener('click', () => {
    // Stop typing if active
    if (isTyping) {
      isTyping = false;
      clearTimeout(typingDebounceTimer);
      socket.emit('stop-typing');
    }

    // Return to Lobby Screen smoothly
    showScreen('lobby');

    // Reset current room tracking
    currentRoom = '';
    messagesContainer.innerHTML = '';
    activeTypers.clear();
    updateTypingBanner();

    // Reconnect socket cleanly
    socket.disconnect();
    socket.connect();
  });

  /**
   * Debounced Typing Listener (1.2 seconds debounce)
   */
  messageInput.addEventListener('input', () => {
    if (!currentRoom) return;

    // Send typing event once on start of typing
    if (!isTyping) {
      isTyping = true;
      socket.emit('typing');
    }

    // Reset 1.2s inactivity timer
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(() => {
      if (isTyping) {
        isTyping = false;
        socket.emit('stop-typing');
      }
    }, 1200);
  });

  /**
   * Send Message Form Submit
   */
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const text = messageInput.value.trim();
    if (!text || !currentRoom) return;

    // Immediately stop typing indicator on message submission
    clearTimeout(typingDebounceTimer);
    if (isTyping) {
      isTyping = false;
      socket.emit('stop-typing');
    }

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

      // Trigger Web Audio API chime for other members' messages
      playHarmonicChime();
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
    // If sender was marked typing, remove them from active typers
    if (payload && payload.sender) {
      activeTypers.delete(payload.sender);
      updateTypingBanner();
    }
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

  // 4. Listen for other users typing
  socket.on('user-typing', (data) => {
    if (data && data.username && data.username !== currentUsername) {
      activeTypers.add(data.username);
      updateTypingBanner();
    }
  });

  // 5. Listen for other users stopping typing
  socket.on('user-stop-typing', (data) => {
    if (data && data.username) {
      activeTypers.delete(data.username);
      updateTypingBanner();
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
