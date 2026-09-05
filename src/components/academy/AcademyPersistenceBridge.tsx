'use client';

import * as React from 'react';
import type { AcademyCourse } from '@/lib/academy/types';
import { getCsrfToken } from '@/lib/security/csrf-client';

const COURSE_KEY = 'oxsig:academy-course:v1';
const PROGRESS_KEY = 'oxsig:academy-progress:v1';
const SERVER_STATE_KEY = 'oxsig:academy-server-state:v1';

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
    const initialLocal = readLocalState();
    // If no server course exists yet, deliberately force the first sync so a
    // pre-production localStorage course is migrated instead of being stranded
    // on this browser forever.
    lastSnapshotRef.current = serverKnownRef.current ? snapshot(initialLocal) : '';

    async function sync() {
      if (cancelled || syncingRef.current) return;
      const local = readLocalState();
      const nextSnapshot = snapshot(local);
      if (nextSnapshot === lastSnapshotRef.current) return;

      syncingRef.current = true;
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
        console.warn('[oxsig] Academy persistence sync deferred:', error);
      } finally {
        syncingRef.current = false;
      }
    }

    // The current Academy page writes progress to localStorage. This bridge is a
    // temporary compatibility layer: PostgreSQL becomes authoritative without
    // requiring a risky rewrite of the working learning cockpit in one step.
    void sync();
    const timer = window.setInterval(() => void sync(), 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
