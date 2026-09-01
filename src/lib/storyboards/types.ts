export type StoryboardPoint = {
  x: number;
  y: number;
};

export type StoryboardDrawEvent = {
  id: string;
  type: 'draw';
  t: number;
  from: StoryboardPoint;
  to: StoryboardPoint;
  width: number;
  color: string;
};

export type StoryboardClearEvent = {
  id: string;
  type: 'clear';
  t: number;
};

export type StoryboardEvent = StoryboardDrawEvent | StoryboardClearEvent;

export type StoryboardDraft = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  events: StoryboardEvent[];
  audio?: Blob;
  audioMimeType?: string;
  status: 'local-draft';
};
