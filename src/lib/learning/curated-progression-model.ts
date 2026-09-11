export type CuratedProgressEvidence = {
  capabilityId: string;
  sourceType: 'academy-practice' | 'academy-reflection' | 'assessment';
  result: 'attempted' | 'demonstrated';
};

export type CuratedProgressResult = {
  demonstratedCapabilityIds: string[];
  nextCapabilityId: string | null;
  completed: boolean;
};

/**
 * A capability is proved by either a demonstrated assessment, or by the
 * stronger Academy learning loop: demonstrated practical evidence plus a
 * demonstrated learner reflection. Page navigation and review state are not
 * accepted as capability evidence.
 */
export function computeCuratedProgress(
  capabilityIds: string[],
  evidence: CuratedProgressEvidence[],
): CuratedProgressResult {
  const valid = new Set(capabilityIds);
  const practice = new Set<string>();
  const reflection = new Set<string>();
  const assessment = new Set<string>();

  for (const item of evidence) {
    if (!valid.has(item.capabilityId) || item.result !== 'demonstrated') continue;
    if (item.sourceType === 'academy-practice') practice.add(item.capabilityId);
    if (item.sourceType === 'academy-reflection') reflection.add(item.capabilityId);
    if (item.sourceType === 'assessment') assessment.add(item.capabilityId);
  }

  const demonstratedCapabilityIds = capabilityIds.filter((capabilityId) => (
    assessment.has(capabilityId)
    || (practice.has(capabilityId) && reflection.has(capabilityId))
  ));
  const demonstrated = new Set(demonstratedCapabilityIds);
  const nextCapabilityId = capabilityIds.find((capabilityId) => !demonstrated.has(capabilityId)) || null;

  return {
    demonstratedCapabilityIds,
    nextCapabilityId,
    completed: capabilityIds.length > 0 && nextCapabilityId === null,
  };
}
