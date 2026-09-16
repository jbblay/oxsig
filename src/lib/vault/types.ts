export const VAULT_KINDS = [
  'command',
  'procedure',
  'cheat_sheet',
  'script',
  'concept',
  'playbook',
] as const;

export type VaultKind = (typeof VAULT_KINDS)[number];
export type VaultSourceType = 'manual' | 'collaboration' | 'board' | 'lab';

export interface VaultItem {
  id: string;
  kind: VaultKind;
  title: string;
  summary: string;
  body: string;
  language?: string | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  sourceType?: VaultSourceType | null;
  sourceId?: string | null;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemInput {
  kind: VaultKind;
  title: string;
  summary?: string;
  body?: string;
  language?: string | null;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
  sourceType?: VaultSourceType | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export const VAULT_KIND_LABELS: Record<VaultKind, string> = {
  command: 'Command',
  procedure: 'Procedure',
  cheat_sheet: 'Cheat sheet',
  script: 'Script',
  concept: 'Concept',
  playbook: 'Playbook',
};

export const VAULT_KIND_DESCRIPTIONS: Record<VaultKind, string> = {
  command: 'A reusable command with context, flags, and expected use.',
  procedure: 'A repeatable technical workflow or troubleshooting sequence.',
  cheat_sheet: 'A compact reference for a tool, protocol, service, or topic.',
  script: 'Reusable code with the explanation and environment it belongs to.',
  concept: 'A technical idea captured in your own words and examples.',
  playbook: 'A larger collection of techniques organized around a goal.',
};
