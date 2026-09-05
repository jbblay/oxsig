import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { SSMClient } from '@aws-sdk/client-ssm';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { verifyTerminalBridgeTicket } from './src/lib/labs/terminal-bridge-ticket.js';

const { Pool } = pg;
const dev = !process.argv.includes('--prod');
process.env.NODE_ENV = dev ? 'development' : 'production';

let serverSentry = null;
const serverSentryDsn = String(process.env.SENTRY_DSN || '').trim();
if (serverSentryDsn) {
  try {
    serverSentry = await import('@sentry/node');
    serverSentry.init({
      dsn: serverSentryDsn,
      environment: String(process.env.VERCEL_ENV || process.env.NODE_ENV || 'development').trim(),
      tracesSampleRate: dev ? 1 : 0.1,
      enabled: true,
    });
  } catch (error) {
    console.warn('[oxsig] Sentry custom-server initialization failed:', error);
  }
}

function captureServerException(error, context = {}) {
  if (!serverSentry) return;
  const exception = error instanceof Error ? error : new Error(String(error));
  serverSentry.withScope((scope) => {
    scope.setTag('oxsig.runtime', 'custom-server');
    if (context.component) scope.setTag('oxsig.component', String(context.component));
    if (context.sessionId) scope.setTag('oxsig.session_id', String(context.sessionId));
    scope.setContext('oxsig', context);
    serverSentry.captureException(exception);
  });
}

const { default: next } = await import('next');

const listenHostname = process.env.OXSIG_HOST || '0.0.0.0';
const appHostname = process.env.OXSIG_APP_HOST || (dev ? 'localhost' : listenHostname);
const port = Number(process.env.PORT || 3000);
const BRIDGE_PATH = '/__oxsig/terminal-bridge';
const MAX_PENDING_BYTES = 1024 * 1024;
const TICKET_RETENTION_MS = 90_000;
const AWS_PING_INTERVAL_MS = 5 * 60_000;

const configuredBridgeSecret = process.env.OXSIG_TERMINAL_BRIDGE_SECRET?.trim();
if (!configuredBridgeSecret) {
  if (!dev) {
    throw new Error(
      '[oxsig] OXSIG_TERMINAL_BRIDGE_SECRET is required in production so terminal bridge tickets survive restarts and remain valid across server instances.'
    );
  }
  process.env.OXSIG_TERMINAL_BRIDGE_SECRET = randomBytes(48).toString('base64url');
  console.warn('[oxsig] Generated an ephemeral terminal bridge secret for local development.');
} else if (configuredBridgeSecret.length < 32) {
  throw new Error('[oxsig] OXSIG_TERMINAL_BRIDGE_SECRET must contain at least 32 characters.');
}

const usedTickets = new Map();
const terminalTicketPool = !dev && process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : null;

function rejectUpgrade(socket, status = 401, reason = 'Unauthorized') {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function cleanupUsedTickets() {
  const now = Date.now();
  for (const [key, expiresAt] of usedTickets) {
    if (expiresAt <= now) usedTickets.delete(key);
  }
}

async function consumeTicket(ticket) {
  const payload = verifyTerminalBridgeTicket(ticket);
  const key = createHash('sha256').update(ticket).digest('hex');
  const expiresAt = Math.max(payload.exp, Date.now() + TICKET_RETENTION_MS);

  if (dev) {
    cleanupUsedTickets();
    if (usedTickets.has(key)) throw new Error('Terminal bridge ticket was already used.');
    usedTickets.set(key, expiresAt);
    return payload;
  }

  if (!terminalTicketPool) {
    throw new Error('DATABASE_URL is required for production terminal ticket replay protection.');
  }

  try {
    await terminalTicketPool.query(
      `INSERT INTO terminal_bridge_ticket_uses (ticket_hash, expires_at)
       VALUES ($1, $2)`,
      [key, new Date(expiresAt)]
    );
  } catch (error) {
    if (error && typeof error === 'object' && error.code === '23505') {
      throw new Error('Terminal bridge ticket was already used.');
    }
    throw error;
  }

  // Keep the short-lived replay table bounded without requiring a separate
  // cleanup job for correctness. This is best-effort and does not affect the
  // accepted ticket if cleanup itself fails.
  void terminalTicketPool
    .query(`DELETE FROM terminal_bridge_ticket_uses WHERE expires_at <= NOW()`)
    .catch((error) => {
      console.warn('[oxsig] Terminal ticket cleanup failed:', error);
      captureServerException(error, { component: 'terminal-ticket-cleanup' });
    });

  return payload;
}

function validateBrowserOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function validateAwsStreamUrl(rawUrl, region) {
  const parsed = new URL(rawUrl);
  const expectedHost = `ssmmessages.${region}.amazonaws.com`;
  if (parsed.protocol !== 'wss:' || parsed.hostname !== expectedHost) {
    throw new Error('Session Manager returned an unexpected WebSocket endpoint.');
  }
  if (!parsed.pathname.startsWith('/v1/data-channel/')) {
    throw new Error('Session Manager returned an unexpected data-channel path.');
  }
  return parsed;
}

function queryObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else query[key] = [existing, value];
  }
  return query;
}

async function signedAwsHeaders(streamUrl, region) {
  const endpoint = validateAwsStreamUrl(streamUrl, region);
  const client = new SSMClient({ region });
  try {
    const credentials = await client.config.credentials();
    const signer = new SignatureV4({
      credentials,
      region,
      service: 'ssmmessages',
      sha256: Sha256,
      applyChecksum: false,
    });
    const signed = await signer.sign(new HttpRequest({
      protocol: 'https:',
      hostname: endpoint.hostname,
      method: 'GET',
      path: endpoint.pathname,
      query: queryObject(endpoint.searchParams),
      headers: { host: endpoint.host },
    }));
    return signed.headers;
  } finally {
    client.destroy();
  }
}

function closeQuietly(socket, code = 1000, reason = '') {
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) return;
  try {
    socket.close(code, reason.slice(0, 120));
  } catch {
    socket.terminate?.();
  }
}

async function bridgeConnection(browserSocket, payload) {
  let awsSocket;
  let pingTimer;
  let pendingBytes = 0;
  const pending = [];

  const stopPings = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = undefined;
  };

  const fail = (message) => {
    stopPings();
    const error = new Error(message);
    console.error(`[oxsig] Terminal bridge failed for ${payload.sessionId}: ${message}`);
    captureServerException(error, {
      component: 'terminal-bridge',
      sessionId: payload.sessionId,
      region: payload.region,
    });
    closeQuietly(browserSocket, 1011, 'AWS Session Manager bridge failed');
    if (awsSocket) closeQuietly(awsSocket, 1011, 'Bridge failed');
  };

  browserSocket.on('message', (data, isBinary) => {
    if (awsSocket?.readyState === WebSocket.OPEN) {
      awsSocket.send(data, { binary: isBinary });
      return;
    }
    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    pendingBytes += size;
    if (pendingBytes > MAX_PENDING_BYTES) {
      fail('Browser sent too much data before the AWS channel opened.');
      return;
    }
    pending.push({ data, isBinary });
  });

  browserSocket.on('close', () => {
    stopPings();
    if (awsSocket) closeQuietly(awsSocket, 1000, 'Browser disconnected');
  });
  browserSocket.on('error', () => {
    stopPings();
    if (awsSocket) closeQuietly(awsSocket, 1011, 'Browser connection error');
  });

  try {
    const headers = await signedAwsHeaders(payload.streamUrl, payload.region);
    if (browserSocket.readyState !== WebSocket.OPEN) return;

    awsSocket = new WebSocket(payload.streamUrl, {
      headers,
      handshakeTimeout: 12_000,
      maxPayload: 2 * 1024 * 1024,
      perMessageDeflate: false,
    });

    awsSocket.on('open', () => {
      pingTimer = setInterval(() => {
        if (awsSocket?.readyState === WebSocket.OPEN) awsSocket.ping('keepalive');
      }, AWS_PING_INTERVAL_MS);
      pingTimer.unref?.();

      for (const item of pending.splice(0)) {
        if (awsSocket.readyState !== WebSocket.OPEN) break;
        awsSocket.send(item.data, { binary: item.isBinary });
      }
      pendingBytes = 0;
    });
    awsSocket.on('message', (data, isBinary) => {
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(data, { binary: isBinary });
      }
    });
    awsSocket.on('close', (code, reason) => {
      stopPings();
      closeQuietly(browserSocket, code === 1000 ? 1000 : 1011, reason.toString() || 'AWS channel closed');
    });
    awsSocket.on('error', (error) => {
      fail(error instanceof Error ? error.message : 'AWS WebSocket error');
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Could not open AWS Session Manager WebSocket');
  }
}

const app = next({ dev, hostname: appHostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const handleNextUpgrade = app.getUpgradeHandler();
const bridgeServer = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024, perMessageDeflate: false });

bridgeServer.on('connection', (socket, _request, payload) => {
  void bridgeConnection(socket, payload);
});

const server = createServer((req, res) => {
  void handle(req, res);
});

server.on('upgrade', async (req, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    rejectUpgrade(socket, 400, 'Bad Request');
    return;
  }

  if (requestUrl.pathname !== BRIDGE_PATH) {
    void handleNextUpgrade(req, socket, head);
    return;
  }

  if (!validateBrowserOrigin(req)) {
    rejectUpgrade(socket, 403, 'Forbidden');
    return;
  }

  const ticket = requestUrl.searchParams.get('ticket');
  if (!ticket) {
    rejectUpgrade(socket);
    return;
  }

  let payload;
  try {
    payload = await consumeTicket(ticket);
    validateAwsStreamUrl(payload.streamUrl, payload.region);
  } catch {
    rejectUpgrade(socket);
    return;
  }

  bridgeServer.handleUpgrade(req, socket, head, (webSocket) => {
    bridgeServer.emit('connection', webSocket, req, payload);
  });
});

server.on('error', (error) => {
  console.error('[oxsig] Server error:', error);
  captureServerException(error, { component: 'http-server' });
  process.exitCode = 1;
});

server.on('close', () => {
  void terminalTicketPool?.end().catch((error) => {
    captureServerException(error, { component: 'terminal-ticket-pool-close' });
  });
});

server.listen(port, listenHostname, () => {
  const mode = dev ? 'development' : 'production';
  console.log(`[oxsig] ${mode} server ready on http://${appHostname}:${port} (listening on ${listenHostname})`);
  console.log('[oxsig] Interactive terminals use the server-mediated AWS SSM WebSocket bridge.');
  if (serverSentry) console.log('[oxsig] Sentry custom-server monitoring is enabled.');
});
