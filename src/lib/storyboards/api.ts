'use client';

import { getCsrfToken } from '@/lib/security/csrf-client';
import { markStoryboardServerCommit } from './secure-save-state';
import type {
  StoryboardComment,
  StoryboardDraft,
  StoryboardPoint,
  StoryboardServerSession,
  StoryboardShare,
} from './types';

type StoryboardAudioObject = {
  key: string;
  size: number;
  mimeType: string;
};

type PresignedStoryboardAudio = {
  upload: {
    url: string;
    fields: Record<string, string>;
    expiresIn: number;
  };
  object: StoryboardAudioObject;
};

type StoryboardListResponse = {
  sessions?: StoryboardServerSession[];
  nextCursor?: string | null;
};

const serverAudioBlobs = new WeakSet<Blob>();
const knownServerVersions = new Map<string, number>();

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error || body.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function rememberVersion(session: StoryboardServerSession) {
  knownServerVersions.set(session.id, session.version);
}

function emitActiveBoard(session: StoryboardServerSession | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('oxsig:board:active', {
    detail: session ? {
      id: session.id,
      title: session.title,
      permission: session.permission,
      version: session.version,
      ownerId: session.ownerId,
      ownerName: session.ownerName,
    } : null,
  }));
}

function storyboardAudioFilename(audio: Blob): string {
  if (audio.type.includes('mp4')) return 'storyboard.m4a';
  if (audio.type.includes('ogg')) return 'storyboard.ogg';
  return 'storyboard.webm';
}

async function uploadStoryboardAudio(audio: Blob): Promise<StoryboardAudioObject> {
  const contentType = audio.type || 'audio/webm';
  const token = await getCsrfToken();
  const presignResponse = await fetch('/api/storyboards/audio/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({
      filename: storyboardAudioFilename(audio),
      size: audio.size,
      contentType,
    }),
  });
  if (!presignResponse.ok) throw new Error(await readError(presignResponse));

  const presigned = (await presignResponse.json()) as PresignedStoryboardAudio;
  const form = new FormData();
  for (const [key, value] of Object.entries(presigned.upload.fields)) form.append(key, value);
  form.append('file', audio, storyboardAudioFilename(audio));

  const uploadResponse = await fetch(presigned.upload.url, {
    method: 'POST',
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Storyboard audio upload failed (${uploadResponse.status})`);
  }
  return presigned.object;
}

async function cleanupStoryboardAudio(object: StoryboardAudioObject): Promise<void> {
  try {
    const token = await getCsrfToken();
    await fetch('/api/storyboards/audio/uploads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ key: object.key }),
    });
  } catch {
    // Best effort only. The object remains private if cleanup cannot run.
  }
}

function storyboardSaveForm(
  draft: StoryboardDraft,
  uploadedAudio: StoryboardAudioObject | null,
  expectedVersion?: number
): FormData {
  const form = new FormData();
  form.set('metadata', JSON.stringify({
    title: draft.title,
    description: null,
    status: draft.audio ? 'ready' : 'draft',
    durationMs: Math.round(draft.durationMs),
    events: draft.events,
  }));
  if (uploadedAudio) form.set('audioStorage', JSON.stringify(uploadedAudio));
  if (expectedVersion !== undefined) form.set('expectedVersion', String(expectedVersion));
  return form;
}

async function sendStoryboardSave(args: {
  draft: StoryboardDraft;
  uploadedAudio: StoryboardAudioObject | null;
  token: string;
  existingId?: string;
  expectedVersion?: number;
}): Promise<Response> {
  return fetch(args.existingId ? `/api/storyboards/${args.existingId}` : '/api/storyboards', {
    method: args.existingId ? 'PATCH' : 'POST',
    headers: { 'x-csrf-token': args.token },
    body: storyboardSaveForm(args.draft, args.uploadedAudio, args.expectedVersion),
  });
}

function preferNewestStoryboard(
  current: StoryboardServerSession | undefined,
  incoming: StoryboardServerSession
): StoryboardServerSession {
  if (!current) return incoming;
  if (incoming.version !== current.version) {
    return incoming.version > current.version ? incoming : current;
  }
  const incomingUpdated = Date.parse(incoming.updatedAt);
  const currentUpdated = Date.parse(current.updatedAt);
  return incomingUpdated > currentUpdated ? incoming : current;
}

export async function listServerStoryboards(): Promise<StoryboardServerSession[]> {
  const sessionsById = new Map<string, StoryboardServerSession>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`/api/storyboards?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as StoryboardListResponse;
    const page = Array.isArray(body.sessions) ? body.sessions : [];
    page.forEach((session) => {
      sessionsById.set(session.id, preferNewestStoryboard(sessionsById.get(session.id), session));
    });

    const nextCursor = typeof body.nextCursor === 'string' && body.nextCursor ? body.nextCursor : null;
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new Error('Board pagination returned a repeated cursor');
    }
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);

  const sessions = [...sessionsById.values()].sort((a, b) => {
    const updated = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return updated || b.id.localeCompare(a.id);
  });
  sessions.forEach(rememberVersion);
  return sessions;
}

export async function getServerStoryboard(
  id: string
): Promise<{ session: StoryboardServerSession; audio?: Blob }> {
  const response = await fetch(`/api/storyboards/${id}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  const session: StoryboardServerSession = (await response.json()).session;
  rememberVersion(session);
  emitActiveBoard(session);

  if (!session.hasAudio) return { session };
  const audioResponse = await fetch(`/api/storyboards/${id}/audio`, { cache: 'no-store' });
  if (!audioResponse.ok) throw new Error(await readError(audioResponse));
  const audio = await audioResponse.blob();
  serverAudioBlobs.add(audio);
  return { session, audio };
}

export async function saveServerStoryboard(
  draft: StoryboardDraft,
  existingId?: string
): Promise<StoryboardServerSession> {
  let uploadedAudio: StoryboardAudioObject | null = null;

  if (draft.audio && !serverAudioBlobs.has(draft.audio)) {
    uploadedAudio = await uploadStoryboardAudio(draft.audio);
  }

  const expectedVersion = existingId ? knownServerVersions.get(existingId) : undefined;
  try {
    const token = await getCsrfToken();
    let response = await sendStoryboardSave({
      draft,
      uploadedAudio,
      token,
      existingId,
      expectedVersion,
    });

    // A recovery draft can outlive an owner Board that was deleted elsewhere.
    // Only explicit owner drafts may recreate on a stale 404; shared drafts must
    // fail closed so revoked access never silently becomes a private fork.
    const canRecreate = draft.serverPermission === 'owner';
    if (existingId && response.status === 404 && canRecreate) {
      knownServerVersions.delete(existingId);
      response = await sendStoryboardSave({
        draft,
        uploadedAudio,
        token,
      });
    }

    if (!response.ok) {
      if (uploadedAudio) await cleanupStoryboardAudio(uploadedAudio);
      throw new Error(await readError(response));
    }

    const body = await response.json();
    const session = body.session as StoryboardServerSession;
    rememberVersion(session);
    markStoryboardServerCommit(draft.id, session.id);
    emitActiveBoard(session);
    if (draft.audio) serverAudioBlobs.add(draft.audio);
    return session;
  } catch (error) {
    throw error;
  }
}

export async function deleteServerStoryboard(id: string): Promise<void> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/storyboards/${id}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': token },
  });
  if (!response.ok) throw new Error(await readError(response));
  knownServerVersions.delete(id);
  emitActiveBoard(null);
}

export async function listStoryboardShares(id: string): Promise<StoryboardShare[]> {
  const response = await fetch(`/api/storyboards/${id}/shares`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).shares;
}

export async function shareStoryboard(
  id: string,
  email: string,
  permission: 'viewer' | 'editor'
): Promise<StoryboardShare> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/storyboards/${id}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ email, permission }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).share;
}

export async function revokeStoryboardShare(id: string, userId: string): Promise<void> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/storyboards/${id}/shares/${userId}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': token },
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function listStoryboardComments(id: string): Promise<StoryboardComment[]> {
  const response = await fetch(`/api/storyboards/${id}/comments`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).comments;
}

export async function createStoryboardComment(
  id: string,
  point: StoryboardPoint,
  body: string
): Promise<StoryboardComment> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/storyboards/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ x: point.x, y: point.y, body }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).comment;
}

export async function updateStoryboardComment(
  id: string,
  commentId: string,
  patch: { body?: string; resolved?: boolean }
): Promise<StoryboardComment> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/storyboards/${id}/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).comment;
}

export async function deleteStoryboardComment(id: string, commentId: string): Promise<void> {
  const token = await getCsrfToken();
  const response = await fetch(`/api/storyboards/${id}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': token },
  });
  if (!response.ok) throw new Error(await readError(response));
}
