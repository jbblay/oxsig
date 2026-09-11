import type { AcademyCourse } from '@/lib/academy/types';
import {
  ACTIVE_DIRECTORY_CAPABILITIES,
  ACTIVE_DIRECTORY_PATH,
  ACTIVE_DIRECTORY_SOURCE_PROMPT,
  buildActiveDirectoryAcademyCourse,
} from '@/lib/learning/active-directory-path';
import {
  PROGRAM_PROCESS_CAPABILITIES,
  PROGRAM_PROCESS_PATH,
  PROGRAM_PROCESS_SOURCE_PROMPT,
  buildProgramProcessAcademyCourse,
} from '@/lib/learning/program-process-path';

export type CuratedCapability = {
  id: string;
  title: string;
  outcome: string;
  evidence: string;
  practiceLabel: string;
};

export type CuratedLearningPath = {
  id: string;
  version: number;
  title: string;
  description: string;
  sourcePrompt: string;
  capabilities: CuratedCapability[];
  buildCourse: () => AcademyCourse;
};

export const CURATED_LEARNING_PATHS: CuratedLearningPath[] = [
  {
    id: PROGRAM_PROCESS_PATH.id,
    version: PROGRAM_PROCESS_PATH.version,
    title: PROGRAM_PROCESS_PATH.title,
    description: PROGRAM_PROCESS_PATH.description,
    sourcePrompt: PROGRAM_PROCESS_SOURCE_PROMPT,
    capabilities: PROGRAM_PROCESS_CAPABILITIES,
    buildCourse: buildProgramProcessAcademyCourse,
  },
  {
    id: ACTIVE_DIRECTORY_PATH.id,
    version: ACTIVE_DIRECTORY_PATH.version,
    title: ACTIVE_DIRECTORY_PATH.title,
    description: ACTIVE_DIRECTORY_PATH.description,
    sourcePrompt: ACTIVE_DIRECTORY_SOURCE_PROMPT,
    capabilities: ACTIVE_DIRECTORY_CAPABILITIES,
    buildCourse: buildActiveDirectoryAcademyCourse,
  },
];

export function getCuratedLearningPath(pathId: string) {
  return CURATED_LEARNING_PATHS.find((path) => path.id === pathId) ?? null;
}

export function getCuratedLearningPathBySourcePrompt(sourcePrompt: string) {
  return CURATED_LEARNING_PATHS.find((path) => path.sourcePrompt === sourcePrompt) ?? null;
}
