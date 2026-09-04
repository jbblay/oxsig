import 'server-only';
import { randomBytes } from 'node:crypto';

export type SsmBridgeTicket = {
  streamUrl: string;
  tokenValue: string;
  region: string;
  sessionId: string;
  ownerId: string;
  expiresAt: number;
};

type BridgeProcess = NodeJS.Process & {
  __oxsigSsmBridgeTickets?: Map<string, SsmBridgeTicket>;
};

const TICKET_TTL_MS = 30_000;

function ticketStore() {
  const bridgeProcess = process as BridgeProcess;
  if (!bridgeProcess.__oxsigSsmBridgeTickets) {
    bridgeProcess.__oxsigSsmBridgeTickets = new Map<string, SsmBridgeTicket>();
  }
  return bridgeProcess.__oxsigSsmBridgeTickets;
}

function pruneExpiredTickets(now = Date.now()) {
  const store = ticketStore();
  for (const [id, ticket] of store.entries()) {
    if (ticket.expiresAt <= now) store.delete(id);
  }
}

export function issueSsmBridgeTicket(input: Omit<SsmBridgeTicket, 'expiresAt'>) {
  pruneExpiredTickets();
  const id = randomBytes(32).toString('hex');
  ticketStore().set(id, { ...input, expiresAt: Date.now() + TICKET_TTL_MS });
  return `/api/labs/terminal-bridge?ticket=${id}`;
}
