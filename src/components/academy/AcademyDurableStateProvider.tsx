'use client';

import * as React from 'react';
import type {
  AcademyCourse,
  AcademyPracticeEvaluation,
  AcademyQuestionAnswer,
} from '@/lib/academy/types';
import { getCsrfToken } from '@/lib/security/csrf-client';

const LEGACY_COURSE_KEY = 'oxsig:academy-course:v1';
const LEGACY_PROGRESS_KEY = 'oxsig:academy-progress:v1';
const LEGACY_SERVER_STATE_KEY = 'oxsig:academy-server-state:v1';

type StoredQa = {
  question: string;
  answer: AcademyQuestionAnswer;
  createdAt: string;
};

type StoredPracticeResult = {
  execution: {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  evaluation: AcademyPracticeEvaluation;
  createdAt: string;
};

export type AcademyDurableState = {
  courseId: string;
  course: AcademyCourse;
  progress: {
    activeIndex: number;
    completed: string[];
  };
  qa: Record<string, StoredQa[]>;
  practiceResults: Record<string, StoredPracticeResult>;
  session: {
    id: string;
    status: 'active' | 'completed' | 'abandoned';
    startedAt: string;
    lastActivityAt: string;
    completedAt: string | null;
  } | null;
  mastery: {
    completedLessons: number;
    totalLessons: number;
    passedPractices: number;
    requiredPractices: number;
    score: number;
    status: 'in_progress' | 'mastered';
    updatedAt: string;
  };
  updatedAt: string;
} | null;

type ContextValue = {
  state: AcademyDurableState;
  ready: boolean;
  migrationError: boolean;
  persistProgress: (activeIndex: number, completedLessonIds: string[]) => Promise<void>;
  refresh: () => Promise<AcademyDurableState>;
};

const AcademyDurableStateContext = React.createContext<ContextValue | null>(null);

function clearLegacyState() {
  try {
    window.localStorage.removeItem(LEGACY_COURSE_KEY);
    window.localStorage.removeItem(LEGACY_PROGRESS_KEY);
    window.localStorage.removeItem(LEGACY_SERVER_STATE_KEY);
  } catch {
    // Durable Academy state does not depend on browser storage.
  }
}

function readLegacyState(): {
  course: AcademyCourse;
  progress: { activeIndex: number; completedLessonIds: string[] };
} | null {
  try {
    const rawCourse = window.localStorage.getItem(LEGACY_COURSE_KEY);
    if (!rawCourse) return null;
    const rawProgress = window.localStorage.getItem(LEGACY_PROGRESS_KEY);
    const progress = rawProgress
      ? JSON.parse(rawProgress) as { activeIndex?: number; completed?: unknown[] }
      : {};
    return {
      course: JSON.parse(rawCourse) as AcademyCourse,
      progress: {
        activeIndex: Math.max(0, Number(progress.activeIndex) || 0),
        completedLessonIds: Array.isArray(progress.completed)
          ? progress.completed.filter((value): value is string => typeof value === 'string')
          : [],
      },
    };
  } catch {
    return null;
  }
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return typeof body?.error === 'string' ? body.error : fallback;
}

export default function AcademyDurableStateProvider({
  initialState,
  children,
}: {
  initialState: AcademyDurableState;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<AcademyDurableState>(initialState);
  const [ready, setReady] = React.useState(false);
  const [migrationError, setMigrationError] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const response = await fetch('/api/academy/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response, 'Academy state could not be loaded'));
    const body = await response.json() as { state: AcademyDurableState };
    setState(body.state);
    return body.state;
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (initialState) {
        clearLegacyState();
        if (!cancelled) setReady(true);
        return;
      }

      const legacy = readLegacyState();
      if (!legacy) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const token = await getCsrfToken();
        const response = await fetch('/api/academy/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
          body: JSON.stringify({
            action: 'import',
            course: legacy.course,
            progress: legacy.progress,
          }),
        });
        if (!response.ok) {
          throw new Error(await responseError(response, 'Legacy Academy state could not be migrated'));
        }
        const body = await response.json() as { state: AcademyDurableState };
        if (!cancelled) {
          setState(body.state);
          setMigrationError(false);
        }
        clearLegacyState();
      } catch (error) {
        console.warn('[oxsig] Legacy Academy migration failed; local data was preserved:', error);
        if (!cancelled) setMigrationError(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [initialState]);

  const persistProgress = React.useCallback(async (activeIndex: number, completedLessonIds: string[]) => {
    const token = await getCsrfToken();
    const response = await fetch('/api/academy/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ activeIndex, completedLessonIds }),
    });
    if (!response.ok) throw new Error(await responseError(response, 'Academy progress could not be saved'));
  }, []);

  const value = React.useMemo<ContextValue>(() => ({
    state,
    ready,
    migrationError,
    persistProgress,
    refresh,
  }), [state, ready, migrationError, persistProgress, refresh]);

  return (
    <AcademyDurableStateContext.Provider value={value}>
      {children}
    </AcademyDurableStateContext.Provider>
  );
}

export function useAcademyDurableState() {
  const value = React.useContext(AcademyDurableStateContext);
  if (!value) throw new Error('useAcademyDurableState must be used inside AcademyDurableStateProvider');
  return value;
}
