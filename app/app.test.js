const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');

const {
  createServer,
  createThothBootVerdict,
  readinessMessage,
  resetEventStore,
  validateCoreEvent,
} = require('./app');

async function startServer(t, options = {}) {
  resetEventStore();
  const server = createServer(options);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  t.after(() => {
    server.close();
    resetEventStore();
  });

  const address = server.address();
  const baseUrl = `http://${address.address}:${address.port}`;
  return { baseUrl, host: address.address, port: address.port };
}

test('serves the readiness message on /', async (t) => {
  const { baseUrl } = await startServer(t, { emitBootVerdict: false });
  const response = await fetch(`${baseUrl}/`);
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(text, readinessMessage);
});

test('exposes a JSON status on /health', async (t) => {
  const { baseUrl } = await startServer(t, { emitBootVerdict: false });
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok' });
});

test('emits Thoth security verdict on boot', async (t) => {
  const { baseUrl } = await startServer(t);
  const response = await fetch(`${baseUrl}/api/status`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, 'mirrornode_core');
  assert.equal(body.nodes.thoth, 'online');
  assert.equal(body.database.status, 'in_memory');
  assert.equal(body.database.persisted_events, 1);
  assert.equal(body.websocket.status, 'online');
  assert.equal(body.fictional_state_present, false);
  assert.equal(body.last_event.event_type, 'security_verdict');
  assert.equal(body.last_event.source_node, 'thoth');
  assert.equal(body.last_event.source_product, 'mirrornode_core');
  assert.equal(body.last_event.subject_id, 'system');
  assert.equal(body.last_event.session_id, 'system_boot');
  assert.equal(body.last_event.severity, 'info');
  assert.equal(body.last_event.payload.verdict, 'hermes_bridge_validated');
  assert.equal(body.last_event.payload.risk_level, 'low');
});

test('accepts and persists canonical security_verdict on POST /event', async (t) => {
  const { baseUrl } = await startServer(t, { emitBootVerdict: false });
  const event = createThothBootVerdict();
  event.event_id = 'test-thoth-0001';
  event.timestamp = '2026-05-14T03:52:00Z';
  event.payload.details = 'Local validation test event.';

  const postResponse = await fetch(`${baseUrl}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  const postBody = await postResponse.json();

  assert.equal(postResponse.status, 201);
  assert.deepEqual(postBody, { status: 'persisted', event_id: 'test-thoth-0001' });

  const statusResponse = await fetch(`${baseUrl}/api/status`);
  const statusBody = await statusResponse.json();

  assert.equal(statusBody.database.persisted_events, 1);
  assert.equal(statusBody.last_event.event_id, 'test-thoth-0001');
  assert.equal(statusBody.last_event.payload.details, 'Local validation test event.');
});

test('rejects schema drift at POST /event', async (t) => {
  const { baseUrl } = await startServer(t, { emitBootVerdict: false });
  const event = createThothBootVerdict();
  event.severity = 'low';

  const response = await fetch(`${baseUrl}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, 'security_verdict severity must be info');
});

test('broadcasts accepted events to /ws/hermes clients', async (t) => {
  const { baseUrl, host, port } = await startServer(t, { emitBootVerdict: false });
  const socket = net.createConnection({ host, port });
  const websocketKey = crypto.randomBytes(16).toString('base64');

  const receivedFrame = new Promise((resolve, reject) => {
    socket.setTimeout(3000, () => reject(new Error('timed out waiting for websocket broadcast')));
    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (text.includes('101 Switching Protocols')) {
        return;
      }
      const payloadLength = chunk[1] & 0x7f;
      const payloadStart = payloadLength === 126 ? 4 : 2;
      resolve(chunk.subarray(payloadStart).toString('utf8'));
    });
  });

  socket.write([
    'GET /ws/hermes HTTP/1.1',
    `Host: ${host}:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${websocketKey}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n'));

  await new Promise((resolve) => setTimeout(resolve, 50));

  const event = createThothBootVerdict();
  event.event_id = 'test-thoth-ws-0001';

  const postResponse = await fetch(`${baseUrl}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  assert.equal(postResponse.status, 201);

  const broadcast = JSON.parse(await receivedFrame);
  assert.equal(broadcast.event_id, 'test-thoth-ws-0001');
  assert.equal(broadcast.event_type, 'security_verdict');

  socket.end();
});

test('returns 404 for other paths', async (t) => {
  const { baseUrl } = await startServer(t, { emitBootVerdict: false });
  const response = await fetch(`${baseUrl}/unknown`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: 'Not Found' });
});

test('validates canonical Thoth event shape directly', () => {
  const event = createThothBootVerdict();
  assert.equal(validateCoreEvent(event), null);
});
