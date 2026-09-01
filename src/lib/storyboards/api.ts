'use client';

import type {
  StoryboardDraft,
  StoryboardServerSession,
  StoryboardShare,
} from './types';

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error || body.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).token;
}

export async function listServerStoryboards(): Promise<StoryboardServerSession[]> {
  const response = await fetch('/api/storyboards', { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).sessions;
}

export async function getServerStoryboard(
  id: string
): Promise<{ session: StoryboardServerSession; audio?: Blob }> {
  const response = await fetch(`/api/storyboards/${id}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  const session: StoryboardServerSession = (await response.json()).session;

  if (!session.hasAudio) return { session };
  const audioResponse = await fetch(`/api/storyboards/${id}/audio`, { cache: 'no-store' });
  if (!audioResponse.ok) throw new Error(await readError(audioResponse));
  return { session, audio: await audioResponse.blob() };
}

export async function saveServerStoryboard(
  draft: StoryboardDraft,
  existingId?: string
): Promise<StoryboardServerSession> {
  const form = new FormData();
  form.set('metadata', JSON.stringify({
    title: draft.title,
    description: null,
    status: draft.audio ? 'ready' : 'draft',
    durationMs: Math.round(draft.durationMs),
    events: draft.events,
  }));
  if (draft.audio) {
    form.set('audio', draft.audio, `storyboard.${draft.audio.type.includes('mp4') ? 'm4a' : 'webm'}`);
  }

  const token = await csrfToken();
  const response = await fetch(existingId ? `/api/storyboards/${existingId}` : '/api/storyboards', {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'x-csrf-token': token },
    body: form,
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).session;
}

export async function deleteServerStoryboard(id: string): Promise<void> {
  const token = await csrfToken();
  const response = await fetch(`/api/storyboards/${id}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': token },
  });
  if (!response.ok) throw new Error(await readError(response));
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
  const token = await csrfToken();
  const response = await fetch(`/api/storyboards/${id}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ email, permission }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()).share;
}

export async function revokeStoryboardShare(id: string, userId: string): Promise<void> {
  const token = await csrfToken();
  const response = await fetch(`/api/storyboards/${id}/shares/${userId}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': token },
  });
  if (!response.ok) throw new Error(await readError(response));
}
