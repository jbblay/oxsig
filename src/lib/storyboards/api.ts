'use client';

import { getCsrfToken } from '@/lib/security/csrf-client';
import type {
  StoryboardDraft,
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

const serverAudioBlobs = new WeakSet<Blob>();

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error || body.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
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

  try {
    const form = new FormData();
    form.set('metadata', JSON.stringify({
      title: draft.title,
      description: null,
      status: draft.audio ? 'ready' : 'draft',
      durationMs: Math.round(draft.durationMs),
      events: draft.events,
    }));
    if (uploadedAudio) form.set('audioStorage', JSON.stringify(uploadedAudio));

    const token = await getCsrfToken();
    const response = await fetch(existingId ? `/api/storyboards/${existingId}` : '/api/storyboards', {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'x-csrf-token': token },
      body: form,
    });
    if (!response.ok) {
      if (uploadedAudio) await cleanupStoryboardAudio(uploadedAudio);
      throw new Error(await readError(response));
    }

    const body = await response.json();
    if (draft.audio) serverAudioBlobs.add(draft.audio);
    return body.session;
  } catch (error) {
    // Only clean up here for failures that occurred before a successful API response.
    // The non-OK response path above already performs the cleanup.
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
