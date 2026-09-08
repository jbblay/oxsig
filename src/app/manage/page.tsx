'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Archive,
  BookOpen,
  Boxes,
  Loader2,
  Pencil,
  Play,
  RadioTower,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

const COURSE_KEY = 'oxsig:academy-course:v1';
const PROGRESS_KEY = 'oxsig:academy-progress:v1';

type AcademyCourseItem = {
  courseId: string;
  title: string;
  topic: string;
  level: string;
  courseStatus: 'active' | 'archived';
  completedLessons: number;
  totalLessons: number;
  masteryScore: number;
  masteryStatus: string;
  sessionStatus: string | null;
  updatedAt: string;
};

type CollaborationItem = {
  id: string;
  name: string;
  description: string;
  collaborationType: string;
  memberCount: number;
  isOwner: boolean;
  updatedAt: string;
};

type WorkspaceItem = {
  id: string;
  name: string;
  description: string;
  isOwner: boolean;
  role: string;
  updatedAt: string;
};

type DashboardState = {
  courses: AcademyCourseItem[];
  collaborations: CollaborationItem[];
  workspaces: WorkspaceItem[];
  hasInfrastructureDesign: boolean;
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function ManageResourcesPage() {
  const [state, setState] = React.useState<DashboardState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [academyResponse, collaborationResponse, workspaceResponse, designResponse] = await Promise.all([
        fetch('/api/academy/history?limit=50', { cache: 'no-store' }),
        fetch('/api/collaborations', { cache: 'no-store' }),
        fetch('/api/live-workspaces', { cache: 'no-store' }),
        fetch('/api/labs/infrastructure-design', { cache: 'no-store' }),
      ]);
      if (!academyResponse.ok) throw new Error(await responseError(academyResponse, 'Could not load Academy courses'));
      if (!collaborationResponse.ok) throw new Error(await responseError(collaborationResponse, 'Could not load collaborations'));
      if (!workspaceResponse.ok) throw new Error(await responseError(workspaceResponse, 'Could not load Live Workspaces'));
      if (!designResponse.ok) throw new Error(await responseError(designResponse, 'Could not load infrastructure design'));

      const academy = await academyResponse.json() as { courses: AcademyCourseItem[] };
      const collaborations = await collaborationResponse.json() as { collaborations: CollaborationItem[] };
      const workspaces = await workspaceResponse.json() as { workspaces: WorkspaceItem[] };
      const design = await designResponse.json() as { design: unknown | null };

      setState({
        courses: academy.courses || [],
        collaborations: (collaborations.collaborations || []).filter((item) => item.isOwner && item.collaborationType !== 'live-workspace'),
        workspaces: (workspaces.workspaces || []).filter((item) => item.isOwner),
        hasInfrastructureDesign: Boolean(design.design),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Resource management could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function mutate(key: string, url: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(key);
    try {
      const token = await getCsrfToken();
      const response = await fetch(url, {
        method,
        headers: {
          'x-csrf-token': token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(await responseError(response, 'The resource could not be changed'));
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The resource could not be changed');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function activateCourse(course: AcademyCourseItem) {
    const ok = await mutate(`course:${course.courseId}`, `/api/academy/courses/${course.courseId}`, 'PATCH', { action: 'activate' });
    if (ok) window.location.href = '/academy';
  }

  async function archiveCourse(course: AcademyCourseItem) {
    if (!window.confirm(`Archive “${course.title}”? You can activate it again from this page.`)) return;
    const ok = await mutate(`course:${course.courseId}`, `/api/academy/courses/${course.courseId}`, 'PATCH', { action: 'archive' });
    if (ok && course.courseStatus === 'active') {
      window.localStorage.removeItem(COURSE_KEY);
      window.localStorage.removeItem(PROGRESS_KEY);
    }
  }

  async function deleteCourse(course: AcademyCourseItem) {
    if (!window.confirm(`Permanently delete “${course.title}” and its progress, sessions, questions, practice attempts, and mastery data?`)) return;
    const ok = await mutate(`course:${course.courseId}`, `/api/academy/courses/${course.courseId}`, 'DELETE');
    if (ok && course.courseStatus === 'active') {
      window.localStorage.removeItem(COURSE_KEY);
      window.localStorage.removeItem(PROGRESS_KEY);
    }
  }

  async function renameCollaboration(item: CollaborationItem) {
    const name = window.prompt('Collaboration name', item.name)?.trim();
    if (!name || name === item.name) return;
    await mutate(`collaboration:${item.id}`, `/api/collaborations/${item.id}`, 'PATCH', { name });
  }

  async function deleteCollaboration(item: CollaborationItem) {
    if (!window.confirm(`Permanently delete “${item.name}” and its collaboration history?`)) return;
    await mutate(`collaboration:${item.id}`, `/api/collaborations/${item.id}`, 'DELETE');
  }

  async function endWorkspace(item: WorkspaceItem) {
    if (!window.confirm(`End “${item.name}”? Active control requests and leases will be cancelled or revoked.`)) return;
    await mutate(`workspace:${item.id}`, `/api/live-workspaces/${item.id}`, 'PATCH', { action: 'end' });
  }

  async function deleteWorkspace(item: WorkspaceItem) {
    if (!window.confirm(`Permanently delete Live Workspace “${item.name}”? Attached resources themselves will not be deleted.`)) return;
    await mutate(`workspace:${item.id}`, `/api/live-workspaces/${item.id}`, 'DELETE');
  }

  async function deleteInfrastructureDesign() {
    if (!window.confirm('Permanently reset your saved infrastructure design?')) return;
    await mutate('infrastructure-design', '/api/labs/infrastructure-design', 'DELETE');
  }

  if (loading && !state) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your resources…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-2">
      <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-purple-500/10 p-6">
        <Badge variant="secondary">Owner controls</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Manage your OXSIG resources</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          These controls operate on resources you own. Operational evidence and audit records remain protected from arbitrary editing or deletion.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void load()} disabled={loading || Boolean(busy)}>
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Academy courses</CardTitle>
          <CardDescription>Activate, archive, or permanently remove your durable learning courses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!state?.courses.length && <p className="text-sm text-muted-foreground">No Academy courses are stored.</p>}
          {state?.courses.map((course) => (
            <div key={course.courseId} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{course.title}</p>
                  <Badge variant={course.courseStatus === 'active' ? 'default' : 'outline'}>{course.courseStatus}</Badge>
                  <Badge variant="secondary">{course.masteryScore}% mastery</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{course.topic} · {course.completedLessons}/{course.totalLessons} lessons · session {course.sessionStatus || 'none'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {course.courseStatus === 'archived' ? (
                  <Button size="sm" variant="outline" disabled={busy === `course:${course.courseId}`} onClick={() => void activateCourse(course)}><Play className="h-4 w-4" /> Activate</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === `course:${course.courseId}`} onClick={() => void archiveCourse(course)}><Archive className="h-4 w-4" /> Archive</Button>
                )}
                <Button size="sm" variant="destructive" disabled={busy === `course:${course.courseId}`} onClick={() => void deleteCourse(course)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" /> Collaboration sessions</CardTitle>
          <CardDescription>Rename or permanently remove collaboration sessions that you own.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!state?.collaborations.length && <p className="text-sm text-muted-foreground">No owned collaboration sessions are active.</p>}
          {state?.collaborations.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.memberCount} member{item.memberCount === 1 ? '' : 's'}{item.description ? ` · ${item.description}` : ''}</p></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === `collaboration:${item.id}`} onClick={() => void renameCollaboration(item)}><Pencil className="h-4 w-4" /> Rename</Button>
                <Button size="sm" variant="destructive" disabled={busy === `collaboration:${item.id}`} onClick={() => void deleteCollaboration(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RadioTower className="h-5 w-5" /> Live Workspaces</CardTitle>
          <CardDescription>End a live session safely or permanently delete the workspace envelope. Attached labs, courses, boards, Vault items, and designs remain owned by you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!state?.workspaces.length && <p className="text-sm text-muted-foreground">No owned Live Workspaces are active.</p>}
          {state?.workspaces.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.description || 'Live technical workspace'}</p></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === `workspace:${item.id}`} onClick={() => void endWorkspace(item)}>End</Button>
                <Button size="sm" variant="destructive" disabled={busy === `workspace:${item.id}`} onClick={() => void deleteWorkspace(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure design</CardTitle>
          <CardDescription>Your infrastructure designer currently stores one durable design per user.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{state?.hasInfrastructureDesign ? 'A saved design exists.' : 'No saved infrastructure design exists.'}</p>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/labs">Open Cyber Lab</Link></Button>
            <Button variant="destructive" disabled={!state?.hasInfrastructureDesign || busy === 'infrastructure-design'} onClick={() => void deleteInfrastructureDesign()}><Trash2 className="h-4 w-4" /> Reset design</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
