import { createHash } from 'node:crypto';
import { SSMClient } from '@aws-sdk/client-ssm';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from '@vercel/functions';
import * as Sentry from '@sentry/nextjs';
import { WebSocket } from 'ws';
import { getPool } from '@/lib/db/pool';
import { verifyTerminalBridgeTicket } from '@/lib/labs/terminal-bridge-ticket.js';

export const runtime = 'nodejs';

const MAX_PENDING_BYTES = 1024 * 1024;
const TICKET_RETENTION_MS = 90_000;
const AWS_PING_INTERVAL_MS = 5 * 60_000;

type BridgeTicketPayload = {
  streamUrl: string;
  region: string;
  sessionId: string;
  target: string;
  exp: number;
};

function capture(error: unknown, payload?: Partial<BridgeTicketPayload>) {
  const exception = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    scope.setTag('oxsig.runtime', 'vercel-websocket');
    scope.setTag('oxsig.component', 'terminal-bridge');
    if (payload?.sessionId) scope.setTag('oxsig.session_id', payload.sessionId);
    scope.setContext('terminalBridge', {
      sessionId: payload?.sessionId,
      target: payload?.target,
      region: payload?.region,
    });
    Sentry.captureException(exception);
  });
}

function browserOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function validateAwsStreamUrl(rawUrl: string, region: string): URL {
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

function queryObject(searchParams: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else query[key] = [existing, value];
  }
  return query;
}

async function signedAwsHeaders(streamUrl: string, region: string) {
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

async function consumeTicket(ticket: string): Promise<BridgeTicketPayload> {
  const payload = verifyTerminalBridgeTicket(ticket) as BridgeTicketPayload;
  validateAwsStreamUrl(payload.streamUrl, payload.region);

  const ticketHash = createHash('sha256').update(ticket).digest('hex');
  const expiresAt = new Date(Math.max(payload.exp, Date.now() + TICKET_RETENTION_MS));
  try {
    await getPool().query(
      `INSERT INTO terminal_bridge_ticket_uses (ticket_hash, expires_at)
       VALUES ($1, $2)`,
      [ticketHash, expiresAt]
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new Error('Terminal bridge ticket was already used.');
    }
    throw error;
  }

  void getPool()
    .query(`DELETE FROM terminal_bridge_ticket_uses WHERE expires_at <= NOW()`)
    .catch((error) => {
      console.warn('[oxsig] Terminal ticket cleanup failed:', error);
      capture(error, payload);
    });

  return payload;
}

function dataBytes(data: WebSocketData): number {
  if (typeof data === 'string') return Buffer.byteLength(data);
  if (Buffer.isBuffer(data)) return data.byteLength;
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.byteLength, 0);
  if (data instanceof ArrayBuffer) return data.byteLength;
  const unknownData: unknown = data;
  if (ArrayBuffer.isView(unknownData)) return unknownData.byteLength;
  return 0;
}

function closeQuietly(socket: { readyState: number; close(code?: number, reason?: string): void }, code = 1000, reason = '') {
  if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) return;
  try {
    socket.close(code, reason.slice(0, 120));
  } catch {
    // The runtime owns the underlying socket. There is nothing else to tear down here.
  }
}

export function GET(request: Request) {
  if (!browserOriginAllowed(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const ticket = new URL(request.url).searchParams.get('ticket');
  if (!ticket) return new Response('Unauthorized', { status: 401 });

  try {
    // Reject malformed/expired tickets before upgrading. The one-time replay claim
    // happens after upgrade so listeners can be attached synchronously, as required
    // by Vercel's WebSocket runtime.
    verifyTerminalBridgeTicket(ticket);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  return experimental_upgradeWebSocket((browserSocket) => {
    let awsSocket: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pendingBytes = 0;
    const pending: Array<{ data: WebSocketData; isBinary: boolean }> = [];
    let payload: BridgeTicketPayload | undefined;
    let closed = false;

    const stopPings = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    };

    const fail = (error: unknown, browserCode = 1011, browserReason = 'AWS Session Manager bridge failed') => {
      if (closed) return;
      closed = true;
      stopPings();
      console.error('[oxsig] Vercel terminal bridge failed:', error);
      capture(error, payload);
      closeQuietly(browserSocket, browserCode, browserReason);
      if (awsSocket) closeQuietly(awsSocket, 1011, 'Bridge failed');
    };

    // Register browser listeners synchronously before any asynchronous ticket or
    // AWS work so an immediate SSM token/data frame cannot be dropped.
    browserSocket.on('message', (data: WebSocketData, isBinary: boolean) => {
      if (awsSocket?.readyState === WebSocket.OPEN) {
        awsSocket.send(data, { binary: isBinary });
        return;
      }
      pendingBytes += dataBytes(data);
      if (pendingBytes > MAX_PENDING_BYTES) {
        fail(new Error('Browser sent too much data before the AWS channel opened.'), 1009, 'Pending terminal data exceeded the limit');
        return;
      }
      pending.push({ data, isBinary });
    });

    browserSocket.on('close', () => {
      closed = true;
      stopPings();
      if (awsSocket) closeQuietly(awsSocket, 1000, 'Browser disconnected');
    });
    browserSocket.on('error', (error: unknown) => {
      fail(error, 1011, 'Browser WebSocket error');
    });

    void (async () => {
      try {
        payload = await consumeTicket(ticket);
        if (closed || browserSocket.readyState !== WebSocket.OPEN) return;

        const headers = await signedAwsHeaders(payload.streamUrl, payload.region);
        if (closed || browserSocket.readyState !== WebSocket.OPEN) return;

        awsSocket = new WebSocket(payload.streamUrl, {
          headers,
          handshakeTimeout: 12_000,
          maxPayload: 2 * 1024 * 1024,
          perMessageDeflate: false,
        });

        awsSocket.on('open', () => {
          if (closed || !awsSocket) return;
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

        awsSocket.on('message', (data) => {
          if (browserSocket.readyState === WebSocket.OPEN) browserSocket.send(data);
        });
        awsSocket.on('close', (code, reason) => {
          closed = true;
          stopPings();
          closeQuietly(browserSocket, code === 1000 ? 1000 : 1011, reason.toString() || 'AWS channel closed');
        });
        awsSocket.on('error', (error) => {
          fail(error);
        });
      } catch (error) {
        const replayOrAuthFailure = error instanceof Error && /ticket|Unauthorized|expired/i.test(error.message);
        fail(error, replayOrAuthFailure ? 1008 : 1011, replayOrAuthFailure ? 'Terminal bridge authorization failed' : 'Terminal bridge setup failed');
      }
    })();
  });
}
