import 'server-only';

import { Rest } from 'ably';

const TOKEN_TTL_MS = 30 * 60 * 1000;
let restClient: Rest | null = null;

function apiKey() {
  return String(process.env.ABLY_API_KEY || '').trim();
}

export function realtimeProviderConfigured() {
  return Boolean(apiKey());
}

export function collaborationChannelName(collaborationId: string) {
  return `oxsig:collaboration:${collaborationId}`;
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
      [channelName]: ['subscribe', 'presence'],
    },
  });
}

export async function publishCollaborationEvent(args: {
  collaborationId: string;
  name: 'message.created' | 'members.changed' | 'session.changed';
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
