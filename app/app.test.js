const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer, readinessMessage } = require('./app');

async function startServer(t) {
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const address = server.address();
  const baseUrl = `http://${address.address}:${address.port}`;
  return { baseUrl };
}

test('serves the readiness message on /', async (t) => {
  const { baseUrl } = await startServer(t);
  const response = await fetch(`${baseUrl}/`);
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(text, readinessMessage);
});

test('exposes a JSON status on /health', async (t) => {
  const { baseUrl } = await startServer(t);
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok' });
});

test('returns 404 for other paths', async (t) => {
  const { baseUrl } = await startServer(t);
  const response = await fetch(`${baseUrl}/unknown`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: 'Not Found' });
});
