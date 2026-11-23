const http = require('http');
const assert = require('assert');
const { io: ioClient } = require('socket.io-client');
const { server, io } = require('./server');

const TEST_PORT = 3001;
const SERVER_URL = `http://localhost:${TEST_PORT}`;

async function runRoomIsolationTests() {
  console.log('\n==================================================');
  console.log('   Multiplayer Chat - Room Isolation Test Suite');
  console.log('==================================================\n');

  // 1. Spin up an isolated test server on port 3001
  await new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`[PASS] Isolated test server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  // Helper to connect and wait for socket connect
  function createClient(username, room) {
    return new Promise((resolve, reject) => {
      const socket = ioClient(SERVER_URL, {
        reconnection: false,
        transports: ['websocket', 'polling']
      });

      socket.on('connect', () => {
        socket.emit('join-room', { username, room });
      });

      // Wait for welcome system-message to confirm join
      socket.on('system-message', function onWelcome(msg) {
        if (msg.text.includes(`Welcome to "#${room}"`)) {
          socket.off('system-message', onWelcome);
          resolve(socket);
        }
      });

      socket.on('connect_error', (err) => {
        reject(err);
      });
    });
  }

  console.log('Connecting test clients...');
  // 2. Connect 3 client sockets: Alice (#general), Bob (#general), Charlie (#design)
  const alice = await createClient('Alice', 'general');
  const bob = await createClient('Bob', 'general');
  const charlie = await createClient('Charlie', 'design');

  console.log('[PASS] Connected: Alice (#general), Bob (#general), Charlie (#design)');

  // 3. Test Room Message Isolation
  console.log('\n--- Test 1: Real-time Message Room Isolation ---');
  let bobReceivedMessage = null;
  let charlieReceivedMessage = false;

  bob.on('chat-message', (data) => {
    bobReceivedMessage = data;
  });

  charlie.on('chat-message', (data) => {
    charlieReceivedMessage = true;
  });

  const testMessage = 'Hello General Room from Alice!';
  alice.emit('chat-message', { text: testMessage });

  // Give enough time for message propagation and isolation verification
  await new Promise((r) => setTimeout(r, 600));

  assert(bobReceivedMessage !== null, 'Bob in #general should have received Alice\'s message');
  assert.strictEqual(bobReceivedMessage.text, testMessage, 'Message text mismatch');
  assert.strictEqual(bobReceivedMessage.sender, 'Alice', 'Message sender mismatch');
  assert.strictEqual(bobReceivedMessage.room, 'general', 'Message room mismatch');
  assert(bobReceivedMessage.timestamp, 'Message should have a server timestamp');
  console.log('[PASS] Bob in #general received Alice\'s message with valid timestamp');

  assert.strictEqual(charlieReceivedMessage, false, 'Charlie in #design must NOT receive messages from #general');
  console.log('[PASS] Room Isolation Verified: Charlie in #design did NOT receive Alice\'s message');

  // 4. Test Typing Indicator Isolation
  console.log('\n--- Test 2: Typing Indicator Room Isolation ---');
  let bobReceivedTyping = false;
  let charlieReceivedTyping = false;

  bob.on('user-typing', (data) => {
    if (data.username === 'Alice') {
      bobReceivedTyping = true;
    }
  });

  charlie.on('user-typing', () => {
    charlieReceivedTyping = true;
  });

  alice.emit('typing');
  await new Promise((r) => setTimeout(r, 400));

  assert.strictEqual(bobReceivedTyping, true, 'Bob in #general should receive typing event from Alice');
  console.log('[PASS] Bob in #general received Alice\'s typing notification');

  assert.strictEqual(charlieReceivedTyping, false, 'Charlie in #design must NOT receive typing events from #general');
  console.log('[PASS] Typing Isolation Verified: Charlie in #design did NOT receive Alice\'s typing notification');

  // 5. Clean teardown
  console.log('\n--- Teardown: Disconnecting Sockets & Stopping Server ---');
  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();

  io.close();
  await new Promise((resolve) => server.close(resolve));
  console.log('[PASS] All sockets disconnected and server closed cleanly.');

  console.log('\n==================================================');
  console.log('   ALL 4 AUTOMATED INTEGRATION TESTS PASSED (100%)');
  console.log('==================================================\n');

  process.exit(0);
}

runRoomIsolationTests().catch((err) => {
  console.error('[FAIL] Test suite encountered an error:', err);
  process.exit(1);
});
