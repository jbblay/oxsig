import { ACTIVE_DIRECTORY_CAPABILITIES, ACTIVE_DIRECTORY_PATH } from '@/lib/learning/active-directory-path';

export type OperationLearningFocus = {
  pathId: string;
  pathTitle: string;
  capabilityId: string;
  capabilityTitle: string;
  objectives: string[];
  evidence: string[];
  practiceLabel: string;
};

export function getOperationLearningFocus(operationSlug?: string | null, capabilityId?: string | null): OperationLearningFocus | null {
  if (operationSlug !== 'black-domain' || !capabilityId) return null;
  const capability = ACTIVE_DIRECTORY_CAPABILITIES.find((item) => item.id === capabilityId);
  if (!capability) return null;

  return {
    pathId: ACTIVE_DIRECTORY_PATH.id,
    pathTitle: ACTIVE_DIRECTORY_PATH.title,
    capabilityId: capability.id,
    capabilityTitle: capability.title,
    objectives: [capability.outcome],
    evidence: [capability.evidence],
    practiceLabel: capability.practiceLabel,
  };
}
