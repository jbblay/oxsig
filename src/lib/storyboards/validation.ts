import { z } from 'zod';

const pointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const eventBase = {
  id: z.string().min(1).max(128),
  t: z.number().finite().min(0).max(86_400_000),
};

const drawEventSchema = z.object({
  ...eventBase,
  type: z.literal('draw'),
  strokeId: z.string().min(1).max(128).optional(),
  from: pointSchema,
  to: pointSchema,
  width: z.number().finite().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tool: z.enum(['pen', 'eraser']).optional(),
});

const clearEventSchema = z.object({
  ...eventBase,
  type: z.literal('clear'),
});

const historyEventSchema = z.object({
  ...eventBase,
  type: z.enum(['undo', 'redo']),
  targetId: z.string().min(1).max(128),
});

export const storyboardEventSchema = z.discriminatedUnion('type', [
  drawEventSchema,
  clearEventSchema,
  historyEventSchema,
]);

export const storyboardSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['draft', 'ready', 'archived']).default('draft'),
  durationMs: z.number().int().min(0).max(86_400_000),
  events: z.array(storyboardEventSchema).max(50_000),
});

export const storyboardShareSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  permission: z.enum(['viewer', 'editor']),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const storyboardIdSchema = z.string().uuid();

export const LEGACY_STORYBOARD_AUDIO_BYTES = 4 * 1024 * 1024;
export const DEFAULT_STORYBOARD_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_STORYBOARD_AUDIO_STORAGE_BYTES = 512 * 1024 * 1024;

export const ALLOWED_STORYBOARD_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg',
]);

export const storyboardAudioReferenceSchema = z.object({
  key: z.string().trim().min(1).max(1024),
  size: z.number().int().min(1).max(MAX_STORYBOARD_AUDIO_STORAGE_BYTES),
  mimeType: z.string().trim().min(1).max(100).refine(
    (value) => ALLOWED_STORYBOARD_AUDIO_TYPES.has(value),
    'Unsupported Storyboard audio format'
  ),
}).strict();

export type StoryboardAudioReference = z.infer<typeof storyboardAudioReferenceSchema>;
