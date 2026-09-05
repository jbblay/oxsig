'use client';

import * as React from 'react';

const ABLY_BROWSER_SDK = 'https://cdn.ably.com/lib/ably.min-2.js';
const ABLY_SCRIPT_ID = 'oxsig-ably-browser-sdk';

type RealtimeMessage = {
  name?: string;
  data?: unknown;
  clientId?: string;
};

type RealtimePresenceMessage = {
  clientId?: string;
  action?: string;
};

type RealtimeChannel = {
  subscribe(name: string, listener: (message: RealtimeMessage) => void): Promise<void>;
  unsubscribe(): void;
  presence: {
    get(): Promise<RealtimePresenceMessage[]>;
    subscribe(listener: (message: RealtimePresenceMessage) => void): Promise<void>;
    unsubscribe(): void;
    enter(data?: unknown): Promise<void>;
    leave(): Promise<void>;
  };
};

type RealtimeClient = {
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

function loadAblyBrowser(): Promise<AblyBrowserGlobal> {
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
  onMembersChanged?: (message: RealtimeMessage) => void;
  onSessionChanged?: (message: RealtimeMessage) => void;
};

export function useCollaborationRealtime(
  collaborationId: string | null,
  callbacks: RealtimeCallbacks
) {
  const [state, setState] = React.useState<CollaborationRealtimeState>('disabled');
  const [onlineCount, setOnlineCount] = React.useState(0);
  const callbacksRef = React.useRef(callbacks);

  React.useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  React.useEffect(() => {
    if (!collaborationId) {
      setState('disabled');
      setOnlineCount(0);
      return;
    }

    let disposed = false;
    let client: RealtimeClient | null = null;
    let channel: RealtimeChannel | null = null;
    let onConnectionState: (() => void) | null = null;
    let onPresence: ((message: RealtimePresenceMessage) => void) | null = null;

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
            if (!disposed) setOnlineCount(members.length);
          } catch {
            if (!disposed) setOnlineCount(0);
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
        const onMembersChanged = (message: RealtimeMessage) => callbacksRef.current.onMembersChanged?.(message);
        const onSessionChanged = (message: RealtimeMessage) => callbacksRef.current.onSessionChanged?.(message);
        onPresence = (_message: RealtimePresenceMessage) => void refreshPresence();

        client.connection.on(onConnectionState);
        await channel.subscribe('message.created', onMessageCreated);
        await channel.subscribe('members.changed', onMembersChanged);
        await channel.subscribe('session.changed', onSessionChanged);
        await channel.presence.subscribe(onPresence);
        await channel.presence.enter({ surface: 'collaboration' });
        await refreshPresence();
        onConnectionState();
      } catch {
        if (!disposed) {
          setState('disabled');
          setOnlineCount(0);
        }
        client?.close();
      }
    };

    void connect();

    return () => {
      disposed = true;
      if (channel) {
        channel.unsubscribe();
        channel.presence.unsubscribe();
        void channel.presence.leave().catch(() => undefined);
      }
      if (client && onConnectionState) client.connection.off(onConnectionState);
      client?.close();
    };
  }, [collaborationId]);

  return { state, onlineCount };
}
