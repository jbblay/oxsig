import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { parse } from 'node:url';
import next from 'next';
import WebSocket, { WebSocketServer } from 'ws';
import { SSMClient } from '@aws-sdk/client-ssm';
import { signSsmUpstreamHeaders } from './src/lib/labs/ssm-upstream-signing.mjs';

const BRIDGE_PATH = '/api/labs/terminal-bridge';
const PING_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BUFFERED_CLIENT_BYTES = 1024 * 1024;
const dev = process.argv.includes('--dev');
const hostname = process.env.OXSIG_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);

function consumeBridgeTicket(id) {
  const store = process.__oxsigSsmBridgeTickets;
  if (!(store instanceof Map) || !id) return null;

  const ticket = store.get(id);
  store.delete(id);
  if (!ticket || ticket.expiresAt <= Date.now()) return null;
  if (
    typeof ticket.streamUrl !== 'string' ||
    typeof ticket.tokenValue !== 'string' ||
    typeof ticket.region !== 'string' ||
    typeof ticket.sessionId !== 'string'
  ) {
    return null;
  }
  return ticket;
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
