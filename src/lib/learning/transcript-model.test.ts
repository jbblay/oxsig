import { describe, expect, it } from 'vitest';
import { CURATED_LEARNING_PATHS } from './curated-paths';
import { buildProvedSkillTranscript, type TranscriptEvidenceRow } from './transcript-model';

function row(overrides: Partial<TranscriptEvidenceRow> = {}): TranscriptEvidenceRow {
  return {
    pathId: 'active-directory-operations',
    pathVersion: 1,
    enrollmentStatus: 'active',
    capabilityId: 'ad-foundations',
    sourceType: 'academy-practice',
    sourceId: crypto.randomUUID(),
    result: 'demonstrated',
    score: null,
    demonstratedAt: '2026-09-11T01:00:00.000Z',
    createdAt: '2026-09-11T01:00:00.000Z',
    ...overrides,
  };
}

describe('proved skills transcript', () => {
  it('requires both practice and reflection when there is no assessment', () => {
    const practiceOnly = buildProvedSkillTranscript([row()], CURATED_LEARNING_PATHS);
    expect(practiceOnly.totalDemonstrated).toBe(0);

    const transcript = buildProvedSkillTranscript([
      row(),
      row({
        sourceType: 'academy-reflection',
        score: 88,
        sourceId: crypto.randomUUID(),
        demonstratedAt: '2026-09-11T01:05:00.000Z',
        createdAt: '2026-09-11T01:05:00.000Z',
      }),
    ], CURATED_LEARNING_PATHS);

    expect(transcript.totalDemonstrated).toBe(1);
    expect(transcript.items[0]?.proofMethod).toBe('practice+reflection');
    expect(transcript.items[0]?.reflection.bestScore).toBe(88);
  });

  it('accepts an evidence-gated demonstrated assessment by itself', () => {
    const transcript = buildProvedSkillTranscript([
      row({ sourceType: 'assessment', score: 93 }),
    ], CURATED_LEARNING_PATHS);

    expect(transcript.totalDemonstrated).toBe(1);
    expect(transcript.items[0]?.proofMethod).toBe('assessment');
    expect(transcript.items[0]?.assessment.bestScore).toBe(93);
  });

  it('does not turn attempted evidence into a proved skill', () => {
    const transcript = buildProvedSkillTranscript([
      row({ sourceType: 'assessment', result: 'attempted', score: 72, demonstratedAt: null }),
      row({ sourceType: 'academy-reflection', result: 'attempted', score: 60, demonstratedAt: null }),
    ], CURATED_LEARNING_PATHS);

    expect(transcript.items).toEqual([]);
  });

  it('retains proof from abandoned journeys and stable historical ids', () => {
    const transcript = buildProvedSkillTranscript([
      row({
        pathId: 'retired-path',
        pathVersion: 3,
        capabilityId: 'old-skill',
        enrollmentStatus: 'abandoned',
        sourceType: 'assessment',
        score: 91,
      }),
    ], CURATED_LEARNING_PATHS);

    expect(transcript.totalDemonstrated).toBe(1);
    expect(transcript.items[0]).toMatchObject({
      pathId: 'retired-path',
      pathVersion: 3,
      pathTitle: 'Retired Path',
      capabilityId: 'old-skill',
      capabilityTitle: 'Old Skill',
      enrollmentStatus: 'abandoned',
    });
  });

  it('sorts newest demonstrated capability first and counts distinct paths', () => {
    const transcript = buildProvedSkillTranscript([
      row({ sourceType: 'assessment', score: 90 }),
      row({
        pathId: 'program-becomes-process',
        capabilityId: 'fork-process',
        sourceType: 'assessment',
        score: 95,
        sourceId: crypto.randomUUID(),
        demonstratedAt: '2026-09-11T03:00:00.000Z',
        createdAt: '2026-09-11T03:00:00.000Z',
      }),
    ], CURATED_LEARNING_PATHS);

    expect(transcript.pathsWithProof).toBe(2);
    expect(transcript.items[0]?.pathId).toBe('program-becomes-process');
    expect(transcript.lastDemonstratedAt).toBe('2026-09-11T03:00:00.000Z');
  });
});
