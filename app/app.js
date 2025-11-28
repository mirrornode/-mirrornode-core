const http = require('http');

const readinessMessage = 'mirrornode-core API ready\n';

function handler(req, res) {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(readinessMessage);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

function createServer() {
  return http.createServer(handler);
}

module.exports = {
  createServer,
  handler,
  readinessMessage,
};
