import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/postgres-safe', () => ({
  stringifyPostgresJson: (value: unknown) => JSON.stringify(value),
}));

import {
  liveWorkspaceActivitySummary,
  recordLiveWorkspaceActivity,
} from './coordination';

describe('Live Workspace coordination activity', () => {
  it('normalizes whitespace and keeps compact activity summaries', () => {
    expect(liveWorkspaceActivitySummary('Added note', '  alpha\n\n beta   gamma  '))
      .toBe('Added note: alpha beta gamma');
  });

  it('truncates long item excerpts without producing oversized summaries', () => {
    const summary = liveWorkspaceActivitySummary('Added checklist item', 'x'.repeat(300));
    expect(summary.startsWith('Added checklist item: ')).toBe(true);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(145);
  });

  it('persists actor, event type, compact summary and JSON metadata', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: 'event-1',
        collaboration_id: 'workspace-1',
        actor_id: 'user-1',
        event_type: 'checklist.completed',
        summary: 'Completed checklist item: Verify DNS',
        metadata: { itemId: 'item-1' },
        created_at: new Date(),
      }],
    });

    await recordLiveWorkspaceActivity({
      queryable: { query } as any,
      collaborationId: 'workspace-1',
      actorId: 'user-1',
      eventType: 'checklist.completed',
      summary: 'Completed   checklist item:   Verify DNS',
      metadata: { itemId: 'item-1' },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO live_workspace_activity_events');
    expect(values).toEqual([
      'workspace-1',
      'user-1',
      'checklist.completed',
      'Completed checklist item: Verify DNS',
      JSON.stringify({ itemId: 'item-1' }),
    ]);
  });

  it('hard-caps arbitrary activity summaries at the database limit', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}] });

    await recordLiveWorkspaceActivity({
      queryable: { query } as any,
      collaborationId: 'workspace-1',
      eventType: 'warroom.linked',
      summary: 'z'.repeat(400),
    });

    const values = query.mock.calls[0][1];
    expect(values[3]).toHaveLength(240);
    expect(values[3].endsWith('…')).toBe(true);
    expect(values[1]).toBeNull();
  });
});
