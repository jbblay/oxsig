'use client';

import * as React from 'react';
import {
  loadAblyBrowser,
  type RealtimeClient,
  type RealtimeChannel,
  type RealtimeMessage,
} from '@/lib/collab/use-realtime';
import { storyboardChannelName, storyboardSignalChannelName } from '@/lib/realtime/channel-names';
import type { StoryboardPermission } from './types';

const CURSOR_PUBLISH_MS = 60;
const CURSOR_TTL_MS = 5000;

export type StoryboardRealtimeState = 'disabled' | 'connecting' | 'connected' | 'disconnected';

export type StoryboardPresence = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  permission: StoryboardPermission;
};

export type StoryboardRemoteCursor = StoryboardPresence & {
  x: number;
  y: number;
  updatedAt: number;
};

type BoardProfile = StoryboardPresence;

type StoryboardRealtimeCallbacks = {
  onBoardChanged?: (message: RealtimeMessage) => void;
  onBoardDeleted?: (message: RealtimeMessage) => void;
  onAccessChanged?: (message: RealtimeMessage) => void;
  onCommentsChanged?: (message: RealtimeMessage) => void;
};

function presenceFromData(clientId: string, data: unknown): StoryboardPresence {
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const permission = value.permission === 'owner' || value.permission === 'editor' || value.permission === 'viewer'
    ? value.permission
    : 'viewer';
  return {
    userId: clientId,
    displayName: typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName.trim()
      : 'OXSIG user',
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    permission,
  };
}

export function useStoryboardRealtime(
  storyboardId: string | null,
  profile: BoardProfile | null,
  callbacks: StoryboardRealtimeCallbacks = {}
) {
  const [state, setState] = React.useState<StoryboardRealtimeState>('disabled');
  const [people, setPeople] = React.useState<StoryboardPresence[]>([]);
  const [remoteCursors, setRemoteCursors] = React.useState<StoryboardRemoteCursor[]>([]);
  const callbacksRef = React.useRef(callbacks);
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const cursorTimersRef = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastCursorPublishRef = React.useRef(0);

  React.useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  React.useEffect(() => {
    if (!storyboardId || !profile) {
      setState('disabled');
      setPeople([]);
      setRemoteCursors([]);
      channelRef.current = null;
      return;
    }

    let disposed = false;
    let client: RealtimeClient | null = null;
    let channel: RealtimeChannel | null = null;
    let signalChannel: RealtimeChannel | null = null;
    let onConnectionState: (() => void) | null = null;

    const refreshPresence = async () => {
      if (!signalChannel) return;
      try {
        const members = await signalChannel.presence.get() as Array<{ clientId?: string; data?: unknown }>;
        const unique = new Map<string, StoryboardPresence>();
        for (const member of members) {
          if (!member.clientId) continue;
          unique.set(member.clientId, presenceFromData(member.clientId, member.data));
        }
        if (!disposed) setPeople([...unique.values()]);
      } catch {
        if (!disposed) setPeople([]);
      }
    };

    const updateCursor = (message: RealtimeMessage) => {
      if (!message.clientId || message.clientId === profile.userId) return;
      const value = message.data && typeof message.data === 'object'
        ? message.data as Record<string, unknown>
        : {};
      const x = Number(value.x);
      const y = Number(value.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
      const cursor: StoryboardRemoteCursor = {
        userId: message.clientId,
        displayName: typeof value.displayName === 'string' && value.displayName.trim()
          ? value.displayName.trim()
          : 'OXSIG user',
        avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
        permission: value.permission === 'owner' || value.permission === 'editor' || value.permission === 'viewer'
          ? value.permission
          : 'viewer',
        x,
        y,
        updatedAt: Date.now(),
      };
      setRemoteCursors((current) => [
        ...current.filter((candidate) => candidate.userId !== cursor.userId),
        cursor,
      ]);
      const previous = cursorTimersRef.current.get(cursor.userId);
      if (previous) clearTimeout(previous);
      cursorTimersRef.current.set(cursor.userId, setTimeout(() => {
        cursorTimersRef.current.delete(cursor.userId);
        setRemoteCursors((current) => current.filter((candidate) => candidate.userId !== cursor.userId));
      }, CURSOR_TTL_MS));
    };

    const connect = async () => {
      setState('connecting');
      try {
        const Ably = await loadAblyBrowser();
        if (disposed) return;
        client = new Ably.Realtime({
          authUrl: `/api/realtime/ably/token?boardId=${encodeURIComponent(storyboardId)}`,
          useTokenAuth: true,
          closeOnUnload: true,
          echoMessages: false,
        });
        channel = client.channels.get(storyboardChannelName(storyboardId));
        signalChannel = client.channels.get(storyboardSignalChannelName(storyboardId));
        channelRef.current = signalChannel;

        onConnectionState = () => {
          if (!client || disposed) return;
          if (client.connection.state === 'connected') setState('connected');
          else if (client.connection.state === 'connecting') setState('connecting');
          else if (client.connection.state === 'failed') setState('disabled');
          else setState('disconnected');
        };
        client.connection.on(onConnectionState);

        await signalChannel.subscribe('cursor.moved', updateCursor);
        await channel.subscribe('board.updated', (message) => callbacksRef.current.onBoardChanged?.(message));
        await channel.subscribe('board.deleted', (message) => callbacksRef.current.onBoardDeleted?.(message));
        await channel.subscribe('access.changed', (message) => callbacksRef.current.onAccessChanged?.(message));
        await channel.subscribe('comment.created', (message) => callbacksRef.current.onCommentsChanged?.(message));
        await channel.subscribe('comment.updated', (message) => callbacksRef.current.onCommentsChanged?.(message));
        await channel.subscribe('comment.deleted', (message) => callbacksRef.current.onCommentsChanged?.(message));
        await signalChannel.presence.subscribe(() => void refreshPresence());
        await signalChannel.presence.enter({
          surface: 'board',
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl || null,
          permission: profile.permission,
        });
        await refreshPresence();
        onConnectionState();
      } catch {
        if (!disposed) {
          setState('disabled');
          setPeople([]);
          setRemoteCursors([]);
        }
        channelRef.current = null;
        client?.close();
      }
    };

    void connect();

    return () => {
      disposed = true;
      cursorTimersRef.current.forEach((timer) => clearTimeout(timer));
      cursorTimersRef.current.clear();
      setRemoteCursors([]);
      if (channel) channel.unsubscribe();
      if (signalChannel) {
        signalChannel.unsubscribe();
        signalChannel.presence.unsubscribe();
        void signalChannel.presence.leave().catch(() => undefined);
      }
      if (client && onConnectionState) client.connection.off(onConnectionState);
      channelRef.current = null;
      client?.close();
    };
  }, [profile, storyboardId]);

  const publishCursor = React.useCallback((x: number, y: number) => {
    const channel = channelRef.current;
    if (!channel || !profile || state !== 'connected') return;
    const now = Date.now();
    if (now - lastCursorPublishRef.current < CURSOR_PUBLISH_MS) return;
    lastCursorPublishRef.current = now;
    void channel.publish('cursor.moved', {
      x,
      y,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null,
      permission: profile.permission,
    }).catch(() => undefined);
  }, [profile, state]);

  return {
    state,
    people,
    onlineCount: people.length,
    remoteCursors,
    publishCursor,
  };
}
