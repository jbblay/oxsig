import type { CuratedLearningPath } from '@/lib/learning/curated-paths';

export type TranscriptEvidenceRow = {
  pathId: string;
  pathVersion: number;
  enrollmentStatus: 'active' | 'completed' | 'abandoned';
  capabilityId: string;
  sourceType: 'academy-practice' | 'academy-reflection' | 'assessment';
  sourceId: string;
  result: 'attempted' | 'demonstrated';
  score: number | null;
  demonstratedAt: string | null;
  createdAt: string;
};

export type ProvedSkillTranscriptItem = {
  pathId: string;
  pathVersion: number;
  pathTitle: string;
  capabilityId: string;
  capabilityTitle: string;
  outcome: string | null;
  enrollmentStatus: 'active' | 'completed' | 'abandoned';
  proofMethod: 'assessment' | 'practice+reflection' | 'assessment+practice';
  demonstratedAt: string;
  latestEvidenceAt: string;
  evidenceCount: number;
  practice: { demonstrated: boolean; count: number; latestAt: string | null };
  reflection: { demonstrated: boolean; count: number; bestScore: number | null; latestAt: string | null };
  assessment: { demonstrated: boolean; count: number; bestScore: number | null; latestAt: string | null };
};

export type ProvedSkillTranscript = {
  version: 1;
  totalDemonstrated: number;
  pathsWithProof: number;
  lastDemonstratedAt: string | null;
  items: ProvedSkillTranscriptItem[];
};

function latest(values: Array<string | null | undefined>) {
  const valid = values.filter((value): value is string => Boolean(value));
  if (!valid.length) return null;
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function bestScore(rows: TranscriptEvidenceRow[]) {
  const scores = rows.filter((row) => row.score !== null).map((row) => Number(row.score));
  return scores.length ? Math.max(...scores) : null;
}

function titleizeId(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildProvedSkillTranscript(
  rows: TranscriptEvidenceRow[],
  paths: CuratedLearningPath[],
): ProvedSkillTranscript {
  const grouped = new Map<string, TranscriptEvidenceRow[]>();
  for (const row of rows) {
    const key = `${row.pathId}@${row.pathVersion}:${row.capabilityId}`;
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  const items: ProvedSkillTranscriptItem[] = [];
  for (const evidenceRows of grouped.values()) {
    const first = evidenceRows[0];
    if (!first) continue;

    const practiceRows = evidenceRows.filter((row) => row.sourceType === 'academy-practice');
    const reflectionRows = evidenceRows.filter((row) => row.sourceType === 'academy-reflection');
    const assessmentRows = evidenceRows.filter((row) => row.sourceType === 'assessment');
    const practiceDemonstrated = practiceRows.some((row) => row.result === 'demonstrated');
    const reflectionDemonstrated = reflectionRows.some((row) => row.result === 'demonstrated');
    const assessmentDemonstrated = assessmentRows.some((row) => row.result === 'demonstrated');
    const demonstrated = assessmentDemonstrated || (practiceDemonstrated && reflectionDemonstrated);
    if (!demonstrated) continue;

    const path = paths.find((candidate) => candidate.id === first.pathId && candidate.version === first.pathVersion) || null;
    const capability = path?.capabilities.find((candidate) => candidate.id === first.capabilityId) || null;
    const demonstratedAt = latest([
      ...assessmentRows.filter((row) => row.result === 'demonstrated').map((row) => row.demonstratedAt),
      ...practiceRows.filter((row) => row.result === 'demonstrated').map((row) => row.demonstratedAt),
      ...reflectionRows.filter((row) => row.result === 'demonstrated').map((row) => row.demonstratedAt),
    ]);
    if (!demonstratedAt) continue;

    const latestEvidenceAt = latest(evidenceRows.map((row) => row.createdAt)) || demonstratedAt;
    const proofMethod = assessmentDemonstrated
      ? (practiceDemonstrated ? 'assessment+practice' : 'assessment')
      : 'practice+reflection';

    items.push({
      pathId: first.pathId,
      pathVersion: first.pathVersion,
      pathTitle: path?.title || titleizeId(first.pathId),
      capabilityId: first.capabilityId,
      capabilityTitle: capability?.title || titleizeId(first.capabilityId),
      outcome: capability?.outcome || null,
      enrollmentStatus: first.enrollmentStatus,
      proofMethod,
      demonstratedAt,
      latestEvidenceAt,
      evidenceCount: evidenceRows.length,
      practice: {
        demonstrated: practiceDemonstrated,
        count: practiceRows.length,
        latestAt: latest(practiceRows.map((row) => row.demonstratedAt || row.createdAt)),
      },
      reflection: {
        demonstrated: reflectionDemonstrated,
        count: reflectionRows.length,
        bestScore: bestScore(reflectionRows),
        latestAt: latest(reflectionRows.map((row) => row.demonstratedAt || row.createdAt)),
      },
      assessment: {
        demonstrated: assessmentDemonstrated,
        count: assessmentRows.length,
        bestScore: bestScore(assessmentRows),
        latestAt: latest(assessmentRows.map((row) => row.demonstratedAt || row.createdAt)),
      },
    });
  }

  items.sort((a, b) => Date.parse(b.demonstratedAt) - Date.parse(a.demonstratedAt));
  return {
    version: 1,
    totalDemonstrated: items.length,
    pathsWithProof: new Set(items.map((item) => `${item.pathId}@${item.pathVersion}`)).size,
    lastDemonstratedAt: items[0]?.demonstratedAt || null,
    items,
  };
}
