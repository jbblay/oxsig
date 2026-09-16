import 'server-only';

import { Rest } from 'ably';
import {
  collaborationChannelName,
  liveTerminalChannelName,
  storyboardChannelName,
} from '@/lib/realtime/channel-names';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const TERMINAL_TOKEN_TTL_MS = 60 * 1000;
let restClient: Rest | null = null;

function apiKey() {
  return String(process.env.ABLY_API_KEY || '').trim();
}

export function realtimeProviderConfigured() {
  return Boolean(apiKey());
}

function getRestClient() {
  const key = apiKey();
  if (!key) return null;
  if (!restClient) restClient = new Rest({ key });
  return restClient;
}

export async function issueCollaborationRealtimeToken(args: {
  collaborationId: string;
  clientId: string;
}) {
  const client = getRestClient();
  if (!client) return null;

  const channelName = collaborationChannelName(args.collaborationId);
  return client.auth.requestToken({
    clientId: args.clientId,
    ttl: TOKEN_TTL_MS,
    capability: {
      [channelName]: ['subscribe', 'publish', 'presence'],
    },
  });
}

export async function issueStoryboardRealtimeToken(args: {
  storyboardId: string;
  clientId: string;
}) {
  const client = getRestClient();
  if (!client) return null;

  const channelName = storyboardChannelName(args.storyboardId);
  return client.auth.requestToken({
    clientId: args.clientId,
    ttl: TOKEN_TTL_MS,
    capability: {
      [channelName]: ['subscribe', 'publish', 'presence'],
    },
  });
}

export async function issueLiveTerminalRealtimeToken(args: {
  collaborationId: string;
  bindingId: string;
  leaseId: string;
  clientId: string;
  mode: 'publish' | 'subscribe';
  leaseExpiresAt: string | Date;
}) {
  const client = getRestClient();
  if (!client) return null;

  const expiresAt = new Date(args.leaseExpiresAt).getTime();
  const remaining = expiresAt - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error('The terminal control lease has expired.');
  }

  const channelName = liveTerminalChannelName(args.collaborationId, args.bindingId, args.leaseId);
  return client.auth.requestToken({
    clientId: args.clientId,
    ttl: Math.max(1_000, Math.min(TERMINAL_TOKEN_TTL_MS, remaining)),
    capability: {
      [channelName]: [args.mode],
    },
  });
}

type CollaborationEventName =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'message.reaction'
  | 'message.pinned'
  | 'read.updated'
  | 'members.changed'
  | 'session.changed';

export async function publishCollaborationEvent(args: {
  collaborationId: string;
  name: CollaborationEventName;
  data: Record<string, unknown>;
}) {
  const client = getRestClient();
  if (!client) return { configured: false, published: false } as const;

  try {
    const channel = client.channels.get(collaborationChannelName(args.collaborationId));
    await channel.publish(args.name, args.data);
    return { configured: true, published: true } as const;
  } catch (error) {
    console.warn('Collaboration realtime publish failed:', error);
    return { configured: true, published: false } as const;
  }
}

export type StoryboardEventName =
  | 'board.updated'
  | 'board.deleted'
  | 'access.changed'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted';

export async function publishStoryboardEvent(args: {
  storyboardId: string;
  name: StoryboardEventName;
  data: Record<string, unknown>;
}) {
  const client = getRestClient();
  if (!client) return { configured: false, published: false } as const;

  try {
    const channel = client.channels.get(storyboardChannelName(args.storyboardId));
    await channel.publish(args.name, args.data);
    return { configured: true, published: true } as const;
  } catch (error) {
    console.warn('Board realtime publish failed:', error);
    return { configured: true, published: false } as const;
  }
}
