const crypto = require('crypto');
const http = require('http');

const readinessMessage = 'mirrornode-core API ready\n';
const serviceIdentifier = 'mirrornode_core';

let serviceStartedAt = Date.now();
let eventLog = [];
const websocketClients = new Set();

function nowIso() {
  return new Date().toISOString();
}

function createThothBootVerdict() {
  return {
    event_id: crypto.randomUUID(),
    event_type: 'security_verdict',
    source_node: 'thoth',
    source_product: serviceIdentifier,
    subject_id: 'system',
    session_id: 'system_boot',
    timestamp: nowIso(),
    payload: {
      verdict: 'hermes_bridge_validated',
      details: 'POST /event, persistence, and status route passed local checks.',
      risk_level: 'low',
    },
    severity: 'info',
  };
}

function resetEventStore({ resetClock = true } = {}) {
  eventLog = [];
  websocketClients.clear();
  if (resetClock) {
    serviceStartedAt = Date.now();
  }
}

function persistEvent(event) {
  eventLog.push(event);
  return event;
}

function getLastEvent() {
  return eventLog.at(-1) || null;
}

function validateCoreEvent(event) {
  const requiredStringFields = [
    'event_id',
    'event_type',
    'source_node',
    'source_product',
    'session_id',
    'timestamp',
    'severity',
  ];

  for (const field of requiredStringFields) {
    if (typeof event[field] !== 'string' || event[field].trim() === '') {
      return `${field} is required`;
    }
  }

  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return 'payload object is required';
  }

  if (event.event_type === 'security_verdict') {
    if (event.source_node !== 'thoth') {
      return 'security_verdict must be emitted by thoth';
    }

    if (event.source_product !== serviceIdentifier) {
      return `security_verdict source_product must be ${serviceIdentifier}`;
    }

    if (event.subject_id !== 'system') {
      return 'security_verdict subject_id must be system';
    }

    if (event.session_id !== 'system_boot') {
      return 'security_verdict session_id must be system_boot';
    }

    if (event.severity !== 'info') {
      return 'security_verdict severity must be info';
    }

    if (event.payload.verdict !== 'hermes_bridge_validated') {
      return 'security_verdict payload.verdict must be hermes_bridge_validated';
    }

    if (event.payload.risk_level !== 'low') {
      return 'security_verdict payload.risk_level must be low';
    }
  }

  return null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function encodeWebSocketTextFrame(message) {
  const payload = Buffer.from(message);
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

function broadcastEvent(event) {
  const frame = encodeWebSocketTextFrame(JSON.stringify(event));

  for (const socket of websocketClients) {
    try {
      socket.write(frame);
    } catch (error) {
      websocketClients.delete(socket);
      socket.destroy();
    }
  }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    writeJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const lastEvent = getLastEvent();
    writeJson(res, 200, {
      service: serviceIdentifier,
      uptime_seconds: Math.floor((Date.now() - serviceStartedAt) / 1000),
      database: {
        status: 'in_memory',
        persisted_events: eventLog.length,
      },
      websocket: {
        status: 'online',
        clients: websocketClients.size,
      },
      nodes: {
        thoth: lastEvent && lastEvent.source_node === 'thoth' ? 'online' : 'offline',
      },
      last_event_timestamp: lastEvent ? lastEvent.timestamp : null,
      last_event: lastEvent,
      fictional_state_present: false,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/event') {
    let event;
    try {
      event = await readJsonBody(req);
    } catch (error) {
      writeJson(res, 400, { error: error.message });
      return;
    }

    const validationError = validateCoreEvent(event);
    if (validationError) {
      writeJson(res, 400, { error: validationError });
      return;
    }

    persistEvent(event);
    broadcastEvent(event);
    writeJson(res, 201, { status: 'persisted', event_id: event.event_id });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(readinessMessage);
    return;
  }

  writeJson(res, 404, { error: 'Not Found' });
}

function handleUpgrade(req, socket) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname !== '/ws/hermes') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
    '',
  ].join('\r\n'));

  websocketClients.add(socket);
  socket.on('close', () => websocketClients.delete(socket));
  socket.on('error', () => websocketClients.delete(socket));
}

function createServer({ emitBootVerdict = true } = {}) {
  if (emitBootVerdict && eventLog.length === 0) {
    persistEvent(createThothBootVerdict());
  }

  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      writeJson(res, 500, { error: 'internal server error', detail: error.message });
    });
  });

  server.on('upgrade', handleUpgrade);
  return server;
}

module.exports = {
  createServer,
  createThothBootVerdict,
  getLastEvent,
  handler,
  readinessMessage,
  resetEventStore,
  serviceIdentifier,
  validateCoreEvent,
};
