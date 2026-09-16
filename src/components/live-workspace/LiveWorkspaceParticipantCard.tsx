'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, CircleUserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type LiveWorkspaceRole = 'owner' | 'instructor' | 'learner' | 'observer';
export type LiveWorkspaceAvailability = 'available' | 'busy' | 'away' | 'focus';

export type LiveWorkspaceParticipantView = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  collaborationStatus: LiveWorkspaceAvailability;
  collaborationStatusMessage: string | null;
  role: LiveWorkspaceRole;
};

const ROLE_LABELS: Record<LiveWorkspaceRole, string> = {
  owner: 'Owner',
  instructor: 'Instructor',
  learner: 'Learner',
  observer: 'Observer',
};

const STATUS_LABELS: Record<LiveWorkspaceAvailability, string> = {
  available: 'Available',
  busy: 'Busy',
  away: 'Away',
  focus: 'Focus',
};

const STATUS_DOT: Record<LiveWorkspaceAvailability, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-rose-500',
  away: 'bg-amber-500',
  focus: 'bg-violet-500',
};

function initials(name: string) {
  const value = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return value || '?';
}

export default function LiveWorkspaceParticipantCard({
  participant,
  online,
  viewerId,
  canManage,
  managerIsOwner,
  busy,
  onRoleChange,
  onRemove,
}: {
  participant: LiveWorkspaceParticipantView;
  online: boolean;
  viewerId: string;
  canManage: boolean;
  managerIsOwner: boolean;
  busy: boolean;
  onRoleChange: (role: Exclude<LiveWorkspaceRole, 'owner'>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const isSelf = participant.id === viewerId;
  const canRemove = participant.role !== 'owner' && (managerIsOwner || isSelf);
  const canEditRole = participant.role !== 'owner' && canManage;

  return (
    <div className="rounded-xl border bg-card/70 p-3 transition-colors hover:bg-muted/20">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full bg-muted text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${expanded ? 'Close' : 'Open'} ${participant.displayName} profile, ${online ? 'online' : 'offline'}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {participant.avatarUrl ? (
            <img src={participant.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            initials(participant.displayName)
          )}
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${online ? 'bg-emerald-500' : 'bg-muted-foreground/35'}`}
          />
        </button>

        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded((value) => !value)}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{participant.displayName}</span>
            {isSelf && <Badge variant="outline" className="h-5 text-[9px]">You</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[participant.collaborationStatus]}`} />
              {STATUS_LABELS[participant.collaborationStatus]}
            </span>
            <span>·</span>
            <span className={online ? 'text-emerald-600 dark:text-emerald-400' : ''}>{online ? 'Online' : 'Offline'}</span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[participant.role]}</Badge>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`${expanded ? 'Hide' : 'Show'} ${participant.displayName} details`} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t pt-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CircleUserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="break-all">{participant.email || 'No email shown'}</p>
              {participant.collaborationStatusMessage && <p className="mt-1 text-foreground">“{participant.collaborationStatusMessage}”</p>}
            </div>
          </div>

          {(canEditRole || canRemove) && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {canEditRole && (
                <>
                  <label className="sr-only" htmlFor={`live-role-${participant.id}`}>Role for {participant.displayName}</label>
                  <select
                    id={`live-role-${participant.id}`}
                    aria-label={`Role for ${participant.displayName}`}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={participant.role}
                    disabled={busy}
                    onChange={(event) => onRoleChange(event.target.value as Exclude<LiveWorkspaceRole, 'owner'>)}
                  >
                    <option value="observer">Observer</option>
                    <option value="learner">Learner</option>
                    {(managerIsOwner || participant.role === 'instructor') && <option value="instructor" disabled={!managerIsOwner}>Instructor</option>}
                  </select>
                </>
              )}
              {canRemove && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
                  {isSelf ? 'Leave workspace' : 'Remove participant'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
