'use client';

import * as React from 'react';

const ABLY_BROWSER_SDK = 'https://cdn.ably.com/lib/ably.min-2.js';
const ABLY_SCRIPT_ID = 'oxsig-ably-browser-sdk';
const TYPING_IDLE_MS = 1200;
const REMOTE_TYPING_TTL_MS = 3500;

export type RealtimeMessage = {
  name?: string;
  data?: unknown;
  clientId?: string;
};

type RealtimePresenceMessage = {
  clientId?: string;
  action?: string;
};

export type RealtimeChannel = {
  subscribe(name: string, listener: (message: RealtimeMessage) => void): Promise<void>;
  unsubscribe(): void;
  publish(name: string, data?: unknown): Promise<void>;
  presence: {
    get(): Promise<RealtimePresenceMessage[]>;
    subscribe(listener: (message: RealtimePresenceMessage) => void): Promise<void>;
    unsubscribe(): void;
    enter(data?: unknown): Promise<void>;
    leave(): Promise<void>;
  };
};

export type RealtimeClient = {
  connection: {
    state: string;
    on(listener: () => void): void;
    off(listener: () => void): void;
  };
  channels: {
    get(name: string): RealtimeChannel;
  };
  close(): void;
};

type AblyBrowserGlobal = {
  Realtime: new (options: Record<string, unknown>) => RealtimeClient;
};

declare global {
  interface Window {
    Ably?: AblyBrowserGlobal;
  }
}

let ablyLoadPromise: Promise<AblyBrowserGlobal> | null = null;

export function loadAblyBrowser(): Promise<AblyBrowserGlobal> {
  if (window.Ably?.Realtime) return Promise.resolve(window.Ably);
  if (ablyLoadPromise) return ablyLoadPromise;

  ablyLoadPromise = new Promise<AblyBrowserGlobal>((resolve, reject) => {
    const existing = document.getElementById(ABLY_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');

    const finish = () => {
      if (window.Ably?.Realtime) resolve(window.Ably);
      else reject(new Error('Ably browser SDK loaded without exposing Realtime'));
    };
    const fail = () => reject(new Error('Ably browser SDK could not be loaded'));

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });

    if (!existing) {
      script.id = ABLY_SCRIPT_ID;
      script.src = ABLY_BROWSER_SDK;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    ablyLoadPromise = null;
    throw error;
  });

  return ablyLoadPromise;
}

export type CollaborationRealtimeState = 'disabled' | 'connecting' | 'connected' | 'disconnected';

type RealtimeCallbacks = {
  onMessageCreated?: (message: RealtimeMessage) => void;
  onMessageChanged?: (message: RealtimeMessage) => void;
  onMembersChanged?: (message: RealtimeMessage) => void;
  onSessionChanged?: (message: RealtimeMessage) => void;
};

function isComposer(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.placeholder.startsWith('Message ');
}

function emitTypingState(collaborationId: string, ids: Set<string>) {
  window.dispatchEvent(new CustomEvent('oxsig:collaboration:typing', {
    detail: { collaborationId, typingIds: [...ids] },
  }));
}

function emitActiveCollaboration(collaborationId: string | null) {
  window.dispatchEvent(new CustomEvent('oxsig:collaboration:active', {
    detail: { collaborationId },
  }));
}

export function useCollaborationRealtime(
  collaborationId: string | null,
  callbacks: RealtimeCallbacks
) {
  const [state, setState] = React.useState<CollaborationRealtimeState>('disabled');
  const [onlineIds, setOnlineIds] = React.useState<string[]>([]);
  const callbacksRef = React.useRef(callbacks);

  React.useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  React.useEffect(() => {
    emitActiveCollaboration(collaborationId);
    if (!collaborationId) {
      setState('disabled');
      setOnlineIds([]);
      window.dispatchEvent(new CustomEvent('oxsig:collaboration:typing', { detail: { typingIds: [] } }));
      return;
    }

    let disposed = false;
    let client: RealtimeClient | null = null;
    let channel: RealtimeChannel | null = null;
    let onConnectionState: (() => void) | null = null;
    let onPresence: ((message: RealtimePresenceMessage) => void) | null = null;
    let localTyping = false;
    let localTypingTimer: ReturnType<typeof setTimeout> | null = null;
    const remoteTyping = new Set<string>();
    const remoteTypingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const publishTyping = async (typing: boolean) => {
      if (!channel || disposed) return;
      if (typing === localTyping) return;
      localTyping = typing;
      try {
        await channel.publish(typing ? 'typing.started' : 'typing.stopped', { surface: 'collaboration' });
      } catch {
        // Typing state is intentionally best effort and must never block composing.
      }
    };

    const stopLocalTypingSoon = () => {
      if (localTypingTimer) clearTimeout(localTypingTimer);
      localTypingTimer = setTimeout(() => void publishTyping(false), TYPING_IDLE_MS);
    };

    const onComposerInput = (event: Event) => {
      if (!isComposer(event.target)) return;
      const hasText = Boolean(event.target.value.trim());
      if (!hasText) {
        if (localTypingTimer) clearTimeout(localTypingTimer);
        localTypingTimer = null;
        void publishTyping(false);
        return;
      }
      void publishTyping(true);
      stopLocalTypingSoon();
    };

    const onComposerBlur = (event: FocusEvent) => {
      if (!isComposer(event.target)) return;
      if (localTypingTimer) clearTimeout(localTypingTimer);
      localTypingTimer = null;
      void publishTyping(false);
    };

    const updateRemoteTyping = (clientId: string, typing: boolean) => {
      const previousTimer = remoteTypingTimers.get(clientId);
      if (previousTimer) clearTimeout(previousTimer);
      remoteTypingTimers.delete(clientId);

      if (typing) {
        remoteTyping.add(clientId);
        remoteTypingTimers.set(clientId, setTimeout(() => {
          remoteTyping.delete(clientId);
          remoteTypingTimers.delete(clientId);
          if (!disposed) emitTypingState(collaborationId, remoteTyping);
        }, REMOTE_TYPING_TTL_MS));
      } else {
        remoteTyping.delete(clientId);
      }
      if (!disposed) emitTypingState(collaborationId, remoteTyping);
    };

    const connect = async () => {
      setState('connecting');
      try {
        const Ably = await loadAblyBrowser();
        if (disposed) return;

        const encodedId = encodeURIComponent(collaborationId);
        client = new Ably.Realtime({
          authUrl: `/api/realtime/ably/token?collaborationId=${encodedId}`,
          useTokenAuth: true,
          closeOnUnload: true,
          echoMessages: false,
        });
        channel = client.channels.get(`oxsig:collaboration:${collaborationId}`);

        const refreshPresence = async () => {
          if (!channel) return;
          try {
            const members = await channel.presence.get();
            const ids = [...new Set(
              members
                .map((member) => member.clientId)
                .filter((clientId): clientId is string => Boolean(clientId))
            )];
            if (!disposed) setOnlineIds(ids);
          } catch {
            if (!disposed) setOnlineIds([]);
          }
        };

        onConnectionState = () => {
          if (disposed || !client) return;
          if (client.connection.state === 'connected') setState('connected');
          else if (client.connection.state === 'connecting') setState('connecting');
          else if (client.connection.state === 'failed') setState('disabled');
          else setState('disconnected');
        };

        const onMessageCreated = (message: RealtimeMessage) => callbacksRef.current.onMessageCreated?.(message);
        const onMessageChanged = (message: RealtimeMessage) => callbacksRef.current.onMessageChanged?.(message);
        const onMembersChanged = (message: RealtimeMessage) => callbacksRef.current.onMembersChanged?.(message);
        const onSessionChanged = (message: RealtimeMessage) => callbacksRef.current.onSessionChanged?.(message);
        const onTypingStarted = (message: RealtimeMessage) => {
          if (message.clientId) updateRemoteTyping(message.clientId, true);
        };
        const onTypingStopped = (message: RealtimeMessage) => {
          if (message.clientId) updateRemoteTyping(message.clientId, false);
        };
        onPresence = (_message: RealtimePresenceMessage) => void refreshPresence();

        client.connection.on(onConnectionState);
        await channel.subscribe('message.created', onMessageCreated);
        await channel.subscribe('message.updated', onMessageChanged);
        await channel.subscribe('message.deleted', onMessageChanged);
        await channel.subscribe('message.reaction', onMessageChanged);
        await channel.subscribe('message.pinned', onMessageChanged);
        await channel.subscribe('read.updated', onMessageChanged);
        await channel.subscribe('members.changed', onMembersChanged);
        await channel.subscribe('session.changed', onSessionChanged);
        await channel.subscribe('typing.started', onTypingStarted);
        await channel.subscribe('typing.stopped', onTypingStopped);
        await channel.presence.subscribe(onPresence);
        await channel.presence.enter({ surface: 'collaboration' });
        document.addEventListener('input', onComposerInput);
        document.addEventListener('focusout', onComposerBlur);
        await refreshPresence();
        onConnectionState();
      } catch {
        if (!disposed) {
          setState('disabled');
          setOnlineIds([]);
        }
        client?.close();
      }
    };

    void connect();

    return () => {
      disposed = true;
      document.removeEventListener('input', onComposerInput);
      document.removeEventListener('focusout', onComposerBlur);
      if (localTypingTimer) clearTimeout(localTypingTimer);
      remoteTypingTimers.forEach((timer) => clearTimeout(timer));
      remoteTypingTimers.clear();
      remoteTyping.clear();
      emitTypingState(collaborationId, remoteTyping);
      if (channel) {
        if (localTyping) void channel.publish('typing.stopped', { surface: 'collaboration' }).catch(() => undefined);
        channel.unsubscribe();
        channel.presence.unsubscribe();
        void channel.presence.leave().catch(() => undefined);
      }
      if (client && onConnectionState) client.connection.off(onConnectionState);
      client?.close();
    };
  }, [collaborationId]);

  return { state, onlineCount: onlineIds.length, onlineIds };
}