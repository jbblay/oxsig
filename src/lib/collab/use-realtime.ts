'use client';

import * as React from 'react';
import { Realtime, type InboundMessage, type PresenceMessage } from 'ably';

export type CollaborationRealtimeState = 'disabled' | 'connecting' | 'connected' | 'disconnected';

type RealtimeCallbacks = {
  onMessageCreated?: (message: InboundMessage) => void;
  onMembersChanged?: (message: InboundMessage) => void;
  onSessionChanged?: (message: InboundMessage) => void;
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
    const encodedId = encodeURIComponent(collaborationId);
    const client = new Realtime({
      authUrl: `/api/realtime/ably/token?collaborationId=${encodedId}`,
      useTokenAuth: true,
      closeOnUnload: true,
      echoMessages: false,
    });
    const channel = client.channels.get(`oxsig:collaboration:${collaborationId}`);

    const refreshPresence = async () => {
      try {
        const members = await channel.presence.get();
        if (!disposed) setOnlineCount(members.length);
      } catch {
        if (!disposed) setOnlineCount(0);
      }
    };

    const onConnectionState = () => {
      if (disposed) return;
      if (client.connection.state === 'connected') setState('connected');
      else if (client.connection.state === 'connecting') setState('connecting');
      else if (client.connection.state === 'failed') setState('disabled');
      else setState('disconnected');
    };

    const onMessageCreated = (message: InboundMessage) => callbacksRef.current.onMessageCreated?.(message);
    const onMembersChanged = (message: InboundMessage) => callbacksRef.current.onMembersChanged?.(message);
    const onSessionChanged = (message: InboundMessage) => callbacksRef.current.onSessionChanged?.(message);
    const onPresence = (_message: PresenceMessage) => void refreshPresence();

    setState('connecting');
    client.connection.on(onConnectionState);
    void channel.subscribe('message.created', onMessageCreated)
      .then(() => channel.subscribe('members.changed', onMembersChanged))
      .then(() => channel.subscribe('session.changed', onSessionChanged))
      .then(() => channel.presence.subscribe(onPresence))
      .then(() => channel.presence.enter({ surface: 'collaboration' }))
      .then(() => refreshPresence())
      .catch(() => {
        if (!disposed) setState('disabled');
      });

    return () => {
      disposed = true;
      channel.unsubscribe();
      channel.presence.unsubscribe();
      void channel.presence.leave().catch(() => undefined);
      client.connection.off(onConnectionState);
      client.close();
    };
  }, [collaborationId]);

  return { state, onlineCount };
}
