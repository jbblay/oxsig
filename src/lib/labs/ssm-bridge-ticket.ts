import 'server-only';

export type SsmBridgeTicketInput = {
  streamUrl: string;
  tokenValue: string;
  region: string;
  sessionId: string;
  ownerId: string;
};

function bridgeConfig() {
  const url = process.env.OXSIG_BRIDGE_INTERNAL_URL;
  const secret = process.env.OXSIG_BRIDGE_INTERNAL_SECRET;
  if (!url || !secret) {
    throw new Error("Oxsig's terminal bridge is not running. Start Oxsig with 'pnpm dev:up'.");
  }
  return { url, secret };
}

export function assertSsmBridgeAvailable() {
  bridgeConfig();
}

export async function issueSsmBridgeTicket(input: SsmBridgeTicketInput) {
  const { url, secret } = bridgeConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-oxsig-bridge-secret': secret,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Oxsig terminal bridge registration failed with status ${response.status}`);
  }

  const body = await response.json().catch(() => null) as { streamUrl?: unknown } | null;
  if (!body || typeof body.streamUrl !== 'string' || !body.streamUrl.startsWith('/api/labs/terminal-bridge?ticket=')) {
    throw new Error('Oxsig terminal bridge returned an invalid one-time ticket');
  }
  return body.streamUrl;
}
