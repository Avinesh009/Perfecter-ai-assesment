# Prompts and Engineering Decision Log

This document records the prompt sequence, iterative development steps, and engineering design rationale utilized while building the **Multiplayer Chat with Rooms** application.

---

## 1. Development Sequence & Prompts

### Phase 1: Architecture & Structural Blueprint
- **User Prompt**: Provided the interview take-home brief and requested: *"First make a structure of it to develop"*.
- **Agent Action**: 
  - Analyzed the constraints: room-based real-time chat, small atomic git commits, zero friction demo in browser, timestamps, clean styling, and delivery requirements.
  - Proposed a high-level system architecture: Node.js + Express + Socket.IO with a vanilla client.
  - Formulated a 5-step milestone roadmap to maintain clear git history.

---

### Phase 2: Environment Setup & Initial Git Commit
- **User Prompt**: 
  > *"Set up a clean Node.js project for a real-time room-based chat application using Express and Socket.io. Please provide: 1. A package.json with dependencies for express and socket.io, along with 'start': 'node server.js' and 'dev': 'node --watch server.js' scripts. 2. A comprehensive .gitignore file that ignores node_modules/, npm-debug logs, .DS_Store, Thumbs.db, and \*.bundle."*
- **Agent Action**:
  - Created `package.json` with required dependencies and scripts.
  - Generated `.gitignore` with comprehensive exclusions.
  - Initialized Git repository and ran `npm install`.
  - **Commit**: `chore: initial project setup with express and socket.io` (`a71abf1`).

---

### Phase 3: Server Core & Strict Room Isolation
- **User Prompt**: 
  > *"Now let's build server.js using Express and Socket.io to handle real-time chat with strict room isolation. Requirements: 1. Serve static frontend files from a public/ directory. 2. Implement 'join-room' event: Accept { username, room }, cleanly leave old room, join new room with socket.join(room), welcome user and notify room. 3. Implement 'chat-message' event: Broadcast strictly using io.to(room).emit, attach id, sender, room, and 12-hour server timestamp. 4. Implement 'disconnect' event: notify remaining users. 5. Provide helper getRoomUsers(room) using io.sockets.adapter.rooms."*
- **Agent Action**:
  - Implemented `server.js` matching all specifications.
  - Used `crypto.randomUUID()` for unique collision-resistant IDs.
  - Applied `io.sockets.adapter.rooms.get(room)` to dynamically resolve active sockets.
  - Created initial static file directory `public/`.
  - **Commit**: `feat: implement Express server and Socket.io with strict room isolation` (`4d3b834`).

---

### Phase 4: Frontend Client & Responsive UI
- **User Prompt**:
  > *"Now let's build the frontend client in public/index.html, public/app.js, and public/style.css using vanilla HTML5, modern CSS3, and Socket.io client. Requirements: 1. Screen 1 (Lobby): Display Name, Room Name, quick-select tags (#general, #developers, #random). 2. Screen 2 (Chat): Header with active room, user count, leave button, scrollable stream, input form. 3. Smooth transition between screens without page reloads. 4. Client logic: escapeHtml() XSS protection, right-aligned blue bubbles for self, left-aligned white bubbles for others, auto-scroll."*
- **Agent Action**:
  - Designed `public/index.html` with semantic structure for Screen 1 (Lobby) and Screen 2 (Chat).
  - Wrote modern, clean CSS in `public/style.css` using custom properties, subtle shadows, and responsive layouts.
  - Implemented `public/app.js` with DOM escaping, room switching, and auto-scroll.
  - **Commit**: `feat: implement responsive chat frontend with lobby, room tags, and XSS protection` (`34768fa`).

---

### Phase 5: Bonus Polish (Timestamps, Typing Indicators & Audio)
- **User Prompt**:
  > *"Let's add the bonus polish requested in the brief: 1. Server Timestamps: Ensure formatted 12-hour local time (e.g. 04:15 PM) is attached by the server and rendered cleanly. 2. Live Typing Indicator: 'typing' and 'stop-typing' events, debounced by 1.2s, animated banner with bouncing dots. 3. Zero-Dependency Audio Chime: Native Web Audio API (AudioContext) two-tone chime for incoming messages from others, mute/unmute toggle (🔔 / 🔕)."*
- **Agent Action**:
  - Updated `server.js` timestamp formatter with `{ hour: '2-digit', minute: '2-digit', hour12: true }`.
  - Added socket handlers for `typing` and `stop-typing`, broadcasting strictly to other sockets in the room via `socket.to(room).emit(...)`.
  - Built a 1,200ms debounced input listener on the client.
  - Created a pure Web Audio API oscillator chime in `app.js` using dual sine waves (`659.25Hz` and `880.00Hz`) with exponential gain decay.
  - Added header mute toggle button and CSS bouncing dot animations.
  - **Commit**: `feat: add 12-hour timestamps, debounced typing indicators, and Web Audio chime` (`d68a657`).

---

### Phase 6: Automated Integration Testing
- **User Prompt**:
  > *"Write an automated integration test in test-rooms.js using socket.io-client to verify room isolation programmatically. Requirements: 1. Isolated server on port 3001. 2. Connect 3 sockets: Alice (general), Bob (general), Charlie (design). 3. Emit message from Alice in general and assert Bob receives it, Charlie does NOT. 4. Assert typing indicators reach Bob and NOT Charlie. 5. Disconnect sockets, close server, exit code 0. 6. Add 'test': 'node test-rooms.js' in package.json."*
- **Agent Action**:
  - Refactored `server.js` to guard `server.listen()` behind `if (require.main === module)` and export `{ app, server, io }`.
  - Installed `socket.io-client` as a dev dependency.
  - Created `test-rooms.js` running 4 rigorous assertions verifying room isolation and typing isolation.
  - Verified 100% test pass rate with `npm test`.
  - **Commit**: `test: add automated integration test verifying room and typing isolation` (`139ef74`).

---

## 2. Key Engineering Decisions & Rationale

| Decision | Chosen Approach | Alternative Considered | Why Chosen |
| :--- | :--- | :--- | :--- |
| **Room Multiplexing** | `io.to(room).emit(...)` server-side routing | Emitting globally to all sockets and filtering on the client | Emitting globally creates a massive privacy & security vulnerability (anyone can inspect network tabs to read messages from other rooms) and wastes network bandwidth. Server-side scoping guarantees absolute message isolation. |
| **Room Presence Tracking** | `io.sockets.adapter.rooms` lookup | Custom in-memory `users = []` or `rooms = {}` array | Custom arrays frequently get out of sync when connections drop unexpectedly or tabs crash. Socket.IO's adapter map automatically cleans up socket IDs upon disconnect, providing a true single source of truth. |
| **Audio Notification** | Native Web Audio API (`AudioContext` oscillators) | External audio assets (`.mp3` or `.wav` files) | External sound files introduce HTTP asset loading latency, 404 risks, and cross-origin audio issues. Web Audio API synthesizes crystal-clear audio programmatically with zero dependencies. |
| **Single-Page Transition** | Dynamic CSS class toggling (`.hidden`) | Multiple HTML pages (`/index.html` & `/chat.html`) | Full page navigations tear down WebSocket connections, forcing renegotiation and latency. SPA transitions preserve socket connections and deliver an instantaneous user experience. |
| **Typing Indicator Debouncing** | 1,200ms debounce timer on `input` | Emitting on every keystroke | Emitting on every single character keystroke floods the WebSocket channel. Debouncing ensures that at most one start and one stop event are dispatched during active typing. |
