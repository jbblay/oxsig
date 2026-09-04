import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { parse } from 'node:url';
import next from 'next';
import WebSocket, { WebSocketServer } from 'ws';
import { SSMClient } from '@aws-sdk/client-ssm';
import { signSsmUpstreamHeaders, validateSsmUpstreamUrl } from './src/lib/labs/ssm-upstream-signing.mjs';

const BRIDGE_PATH = '/api/labs/terminal-bridge';
const INTERNAL_BRIDGE_PATH = '/__oxsig/internal/ssm-bridge';
const TICKET_TTL_MS = 30_000;
const PING_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BUFFERED_CLIENT_BYTES = 1024 * 1024;
const MAX_INTERNAL_BODY_BYTES = 32 * 1024;
const dev = process.argv.includes('--dev');
const hostname = process.env.OXSIG_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const internalBridgeSecret = randomBytes(32).toString('hex');
const bridgeTickets = new Map();

// Route handlers can register a short-lived ticket without sharing in-memory
// module state with Next.js. The secret exists only inside this Node process.
process.env.OXSIG_BRIDGE_INTERNAL_SECRET = internalBridgeSecret;
process.env.OXSIG_BRIDGE_INTERNAL_URL = `http://127.0.0.1:${port}${INTERNAL_BRIDGE_PATH}`;

function pruneBridgeTickets(now = Date.now()) {
  for (const [id, ticket] of bridgeTickets.entries()) {
    if (ticket.expiresAt <= now) bridgeTickets.delete(id);
  }
}

function consumeBridgeTicket(id) {
  if (!id) return null;
  pruneBridgeTickets();
  const ticket = bridgeTickets.get(id);
  bridgeTickets.delete(id);
  return ticket || null;
}

function isLoopback(request) {
  const address = request.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function hasInternalBridgeSecret(request) {
  const supplied = request.headers['x-oxsig-bridge-secret'];
  if (typeof supplied !== 'string') return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(internalBridgeSecret);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_INTERNAL_BODY_BYTES) {
        reject(new Error('Internal bridge registration body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

async function handleInternalBridgeRegistration(request, response) {
  if (request.method !== 'POST' || !isLoopback(request) || !hasInternalBridgeSecret(request)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    if (
      !body ||
      typeof body.streamUrl !== 'string' || body.streamUrl.length > 4096 ||
      typeof body.tokenValue !== 'string' || body.tokenValue.length > 8192 ||
      typeof body.region !== 'string' || !/^[a-z0-9-]{3,32}$/.test(body.region) ||
      typeof body.sessionId !== 'string' || body.sessionId.length < 1 || body.sessionId.length > 128 ||
      typeof body.ownerId !== 'string' || body.ownerId.length < 1 || body.ownerId.length > 256
    ) {
      sendJson(response, 400, { error: 'Invalid bridge registration' });
      return;
    }

    validateSsmUpstreamUrl(body.streamUrl, body.region);
    pruneBridgeTickets();
    const id = randomBytes(32).toString('hex');
    bridgeTickets.set(id, { ...body, expiresAt: Date.now() + TICKET_TTL_MS });
    sendJson(response, 201, { streamUrl: `${BRIDGE_PATH}?ticket=${id}` });
  } catch (error) {
    console.error(`[oxsig] Internal bridge registration failed: ${error instanceof Error ? error.message : String(error)}`);
    if (!response.headersSent) sendJson(response, 400, { error: 'Bridge registration failed' });
  }
}

function isSameOriginUpgrade(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') &&
      parsedOrigin.host === host
    );
  } catch {
    return false;
  }
}

function rawDataLength(data) {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.byteLength, 0);
  return data?.byteLength ?? data?.length ?? 0;
}

function rawDataText(data) {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return String(data);
}

function isBrowserOpenDataChannelMessage(data, isBinary) {
  if (isBinary) return false;
  try {
    const body = JSON.parse(rawDataText(data));
    return (
      body?.MessageSchemaVersion === '1.0' &&
      typeof body?.RequestId === 'string' &&
      typeof body?.TokenValue === 'string'
    );
  } catch {
    return false;
  }
}

function closeReason(reason) {
  return String(reason || '').slice(0, 120);
}

function websocketCloseCode(code) {
  return Number.isInteger(code) && code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code)
    ? code
    : 1011;
}

async function openSsmUpstream(client, ticket) {
  let upstream = null;
  let pingTimer = null;
  let ended = false;
  let browserOpenMessageConsumed = false;
  let pendingBytes = 0;
  const pendingClientMessages = [];

  const cleanup = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  };

  const closeUpstream = () => {
    if (!upstream) return;
    try {
      if (upstream.readyState === WebSocket.OPEN) upstream.close(1000, 'Oxsig browser disconnected');
      else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    } catch {
      // Best-effort cleanup; AWS also expires an abandoned Session Manager channel.
    }
  };

  client.on('message', (data, isBinary) => {
    if (ended) return;

    // The existing browser protocol sends an OpenDataChannel JSON message as
    // soon as its local socket opens. Consume that compatibility message here;
    // the bridge sends the real AWS token itself and never exposes it upstream.
    if (!browserOpenMessageConsumed && isBrowserOpenDataChannelMessage(data, isBinary)) {
      browserOpenMessageConsumed = true;
      return;
    }

    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }

    const size = rawDataLength(data);
    pendingBytes += size;
    if (pendingBytes > MAX_BUFFERED_CLIENT_BYTES) {
      ended = true;
      cleanup();
      closeUpstream();
      client.close(1009, 'Terminal bridge input buffer exceeded');
      return;
    }
    pendingClientMessages.push({ data, isBinary });
  });

  client.on('close', () => {
    ended = true;
    cleanup();
    closeUpstream();
  });

  client.on('error', () => {
    ended = true;
    cleanup();
    closeUpstream();
  });

  try {
    const credentialClient = new SSMClient({ region: ticket.region });
    const credentials = await credentialClient.config.credentials();
    credentialClient.destroy();
    const signedHeaders = await signSsmUpstreamHeaders(ticket.streamUrl, ticket.region, credentials);

    if (ended) return;

    upstream = new WebSocket(ticket.streamUrl, {
      headers: signedHeaders,
      perMessageDeflate: false,
      handshakeTimeout: 15_000,
      maxPayload: 16 * 1024 * 1024,
    });

    upstream.on('open', () => {
      if (ended) {
        closeUpstream();
        return;
      }

      // Match Session Manager's OpenDataChannel handshake, but perform it on
      // the trusted server side so neither AWS credentials nor TokenValue are
      // exposed to the browser.
      upstream.send(JSON.stringify({
        MessageSchemaVersion: '1.0',
        RequestId: randomUUID(),
        TokenValue: ticket.tokenValue,
        ClientId: randomUUID(),
        ClientVersion: '1.0.0',
      }));

      for (const message of pendingClientMessages.splice(0)) {
        upstream.send(message.data, { binary: message.isBinary });
      }
      pendingBytes = 0;

      pingTimer = setInterval(() => {
        if (upstream?.readyState === WebSocket.OPEN) upstream.ping('keepalive');
      }, PING_INTERVAL_MS);
    });

    upstream.on('message', (data, isBinary) => {
      if (!ended && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });

    upstream.on('close', (code, reason) => {
      cleanup();
      if (ended) return;
      ended = true;
      if (client.readyState === WebSocket.OPEN) {
        client.close(websocketCloseCode(code), closeReason(reason) || 'AWS Session Manager data channel closed');
      }
    });

    upstream.on('error', (error) => {
      console.error(`[oxsig] SSM bridge upstream error for ${ticket.sessionId}: ${error.message}`);
      cleanup();
      if (ended) return;
      ended = true;
      if (client.readyState === WebSocket.OPEN) {
        client.close(1011, 'AWS Session Manager upstream connection failed');
      }
    });
  } catch (error) {
    console.error(`[oxsig] SSM bridge setup error for ${ticket.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    cleanup();
    ended = true;
    closeUpstream();
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, 'Could not authenticate the AWS Session Manager data channel');
    }
  }
}

const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const bridgeServer = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1024 * 1024 });

const server = createServer((request, response) => {
  let pathname = '/';
  try {
    pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
  } catch {
    // Let Next.js render its normal bad-request handling for malformed URLs.
  }

  if (pathname === INTERNAL_BRIDGE_PATH) {
    void handleInternalBridgeRegistration(request, response);
    return;
  }
  void handle(request, response, parse(request.url || '/', true));
});

server.on('upgrade', (request, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  } catch {
    return;
  }

  // Leave every other upgrade (including Next.js development HMR) untouched.
  if (requestUrl.pathname !== BRIDGE_PATH) return;

  if (!isSameOriginUpgrade(request)) {
    socket.destroy();
    return;
  }

  const ticket = consumeBridgeTicket(requestUrl.searchParams.get('ticket'));
  if (!ticket) {
    socket.destroy();
    return;
  }

  bridgeServer.handleUpgrade(request, socket, head, (client) => {
    void openSsmUpstream(client, ticket);
  });
});

server.listen(port, hostname, () => {
  const mode = dev ? 'development' : 'production';
  console.log(`[oxsig] ${mode} server ready on http://localhost:${port}`);
  console.log('[oxsig] AWS Session Manager terminal bridge is enabled');
});

const shutdown = () => {
  bridgeServer.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
