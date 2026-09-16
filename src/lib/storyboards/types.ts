export type StoryboardPoint = {
  x: number;
  y: number;
};

export type StoryboardTool = 'pen' | 'eraser';

export type StoryboardDrawEvent = {
  id: string;
  type: 'draw';
  t: number;
  /** Groups the small drawing segments that make up one pointer stroke. */
  strokeId?: string;
  from: StoryboardPoint;
  to: StoryboardPoint;
  width: number;
  color: string;
  /** Missing on version-one drafts, where every segment was a pen mark. */
  tool?: StoryboardTool;
};

export type StoryboardClearEvent = {
  id: string;
  type: 'clear';
  t: number;
};

export type StoryboardUndoEvent = {
  id: string;
  type: 'undo';
  t: number;
  targetId: string;
};

export type StoryboardRedoEvent = {
  id: string;
  type: 'redo';
  t: number;
  targetId: string;
};

export type StoryboardEvent =
  | StoryboardDrawEvent
  | StoryboardClearEvent
  | StoryboardUndoEvent
  | StoryboardRedoEvent;

export type StoryboardDraft = {
  version?: 1;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  events: StoryboardEvent[];
  audio?: Blob;
  audioMimeType?: string;
  status: 'local-draft';
  serverId?: string;
  serverPermission?: StoryboardPermission;
};

export type StoryboardPermission = 'owner' | 'editor' | 'viewer';

export type StoryboardServerSession = {
  id: string;
  title: string;
  description?: string | null;
  status: 'draft' | 'ready' | 'archived';
  durationMs: number;
  events?: StoryboardEvent[];
  hasAudio: boolean;
  audioMimeType?: string | null;
  audioSize?: number | null;
  ownerId: string;
  ownerName: string;
  ownerEmail?: string | null;
  permission: StoryboardPermission;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type StoryboardShare = {
  userId: string;
  displayName: string;
  email: string;
  permission: Exclude<StoryboardPermission, 'owner'>;
  expiresAt?: string | null;
  createdAt: string;
};

export type StoryboardComment = {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  point: StoryboardPoint;
  body: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  createdAt: string;
  updatedAt: string;
};
