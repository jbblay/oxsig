'use client';

import * as React from 'react';
import type { AcademyCourse } from '@/lib/academy/types';
import { subscribeToLocalStorageChanges } from '@/lib/persistence/storage-change-observer';
import { getCsrfToken } from '@/lib/security/csrf-client';

const COURSE_KEY = 'oxsig:academy-course:v1';
const PROGRESS_KEY = 'oxsig:academy-progress:v1';
const SERVER_STATE_KEY = 'oxsig:academy-server-state:v1';
const SYNC_DEBOUNCE_MS = 300;
const SYNC_RETRY_MS = 5000;

type InitialState = {
  courseId: string;
  course: AcademyCourse;
  progress: {
    activeIndex: number;
    completed: string[];
  };
  updatedAt: string;
} | null;

type LocalState = {
  course: AcademyCourse | null;
  activeIndex: number;
  completedLessonIds: string[];
};

function readLocalState(): LocalState {
  try {
    const rawCourse = window.localStorage.getItem(COURSE_KEY);
    const rawProgress = window.localStorage.getItem(PROGRESS_KEY);
    const progress = rawProgress
      ? JSON.parse(rawProgress) as { activeIndex?: number; completed?: string[] }
      : {};
    return {
      course: rawCourse ? JSON.parse(rawCourse) as AcademyCourse : null,
      activeIndex: Math.max(0, Number(progress.activeIndex) || 0),
      completedLessonIds: Array.isArray(progress.completed)
        ? progress.completed.filter((value): value is string => typeof value === 'string')
        : [],
    };
  } catch {
    return { course: null, activeIndex: 0, completedLessonIds: [] };
  }
}

function snapshot(state: LocalState) {
  return JSON.stringify({
    course: state.course,
    activeIndex: state.activeIndex,
    completedLessonIds: state.completedLessonIds,
  });
}

export default function AcademyPersistenceBridge({ initialState }: { initialState: InitialState }) {
  const serverKnownRef = React.useRef(Boolean(initialState));
  const syncingRef = React.useRef(false);
  const lastSnapshotRef = React.useRef('');

  React.useLayoutEffect(() => {
    if (!initialState?.course) return;
    try {
      window.localStorage.setItem(COURSE_KEY, JSON.stringify(initialState.course));
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        activeIndex: initialState.progress.activeIndex,
        completed: initialState.progress.completed,
      }));
      window.localStorage.setItem(SERVER_STATE_KEY, JSON.stringify({
        courseId: initialState.courseId,
        updatedAt: initialState.updatedAt,
      }));
    } catch {
      // The Academy page still works without browser storage; the server remains
      // the durable source of truth when storage becomes available again.
    }
  }, [initialState]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;
    let queued = false;
    const initialLocal = readLocalState();
    // If no server course exists yet, deliberately force the first sync so a
    // pre-production localStorage course is migrated instead of being stranded
    // on this browser forever.
    lastSnapshotRef.current = serverKnownRef.current ? snapshot(initialLocal) : '';

    const scheduleSync = (delay = SYNC_DEBOUNCE_MS) => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void sync();
      }, delay);
    };

    async function sync() {
      if (cancelled) return;
      if (syncingRef.current) {
        queued = true;
        return;
      }

      const local = readLocalState();
      const nextSnapshot = snapshot(local);
      if (nextSnapshot === lastSnapshotRef.current) return;

      syncingRef.current = true;
      let failed = false;
      try {
        if (!local.course) {
          if (serverKnownRef.current) {
            const token = await getCsrfToken();
            const response = await fetch('/api/academy/state', {
              method: 'DELETE',
              headers: { 'x-csrf-token': token },
            });
            if (!response.ok) throw new Error('Academy reset could not be synchronized');
            serverKnownRef.current = false;
            window.localStorage.removeItem(SERVER_STATE_KEY);
          }
          lastSnapshotRef.current = nextSnapshot;
          return;
        }

        const token = await getCsrfToken();
        if (!serverKnownRef.current) {
          const response = await fetch('/api/academy/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
            body: JSON.stringify({
              action: 'import',
              course: local.course,
              progress: {
                activeIndex: local.activeIndex,
                completedLessonIds: local.completedLessonIds,
              },
            }),
          });
          if (!response.ok) throw new Error('Existing Academy course could not be migrated to the server');
          const body = await response.json().catch(() => ({}));
          serverKnownRef.current = Boolean(body?.state?.courseId);
          if (body?.state?.courseId) {
            window.localStorage.setItem(SERVER_STATE_KEY, JSON.stringify({
              courseId: body.state.courseId,
              updatedAt: body.state.updatedAt,
            }));
          }
        } else {
          const response = await fetch('/api/academy/state', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
            body: JSON.stringify({
              activeIndex: local.activeIndex,
              completedLessonIds: local.completedLessonIds,
            }),
          });
          if (!response.ok) {
            if (response.status === 409) serverKnownRef.current = false;
            throw new Error('Academy progress could not be synchronized');
          }
        }

        lastSnapshotRef.current = nextSnapshot;
      } catch (error) {
        failed = true;
        console.warn('[oxsig] Academy persistence sync deferred:', error);
      } finally {
        syncingRef.current = false;
        if (cancelled) return;
        if (queued) {
          queued = false;
          scheduleSync();
        } else if (failed) {
          scheduleSync(SYNC_RETRY_MS);
        }
      }
    }

    const unsubscribe = subscribeToLocalStorageChanges([COURSE_KEY, PROGRESS_KEY], () => scheduleSync());
    // Catch a legacy local state immediately, then react only to actual storage
    // changes. Failed network writes receive a bounded retry without idle polling.
    void sync();

    return () => {
      cancelled = true;
      unsubscribe();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
