import { describe, expect, it } from 'vitest';
import {
  storyboardAudioReferenceSchema,
  storyboardSessionSchema,
  storyboardShareSchema,
} from './validation';

describe('storyboard API validation', () => {
  it('accepts a bounded normalized drawing event', () => {
    const result = storyboardSessionSchema.safeParse({
      title: 'OSI model',
      durationMs: 1200,
      status: 'ready',
      events: [{
        id: 'event-1',
        strokeId: 'stroke-1',
        type: 'draw',
        t: 200,
        from: { x: 0.1, y: 0.2 },
        to: { x: 0.3, y: 0.4 },
        width: 4,
        color: '#0f172a',
        tool: 'pen',
      }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects out-of-canvas coordinates and invalid share roles', () => {
    const invalidSession = storyboardSessionSchema.safeParse({
      title: 'Bad board',
      durationMs: 0,
      events: [{
        id: 'event-1', type: 'draw', t: 0,
        from: { x: -1, y: 0 }, to: { x: 1, y: 1 },
        width: 4, color: '#000000',
      }],
    });
    expect(invalidSession.success).toBe(false);
    expect(storyboardShareSchema.safeParse({
      email: 'bob@example.com', permission: 'owner',
    }).success).toBe(false);
  });

  it('accepts only bounded private-storage audio references', () => {
    expect(storyboardAudioReferenceSchema.safeParse({
      key: 'storyboards/audio/user-id/recording.webm',
      size: 1024,
      mimeType: 'audio/webm',
    }).success).toBe(true);

    expect(storyboardAudioReferenceSchema.safeParse({
      key: 'storyboards/audio/user-id/recording.exe',
      size: 1024,
      mimeType: 'application/octet-stream',
    }).success).toBe(false);

    expect(storyboardAudioReferenceSchema.safeParse({
      key: 'storyboards/audio/user-id/huge.webm',
      size: 600 * 1024 * 1024,
      mimeType: 'audio/webm',
    }).success).toBe(false);
  });
});
