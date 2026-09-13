import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('background request polling regressions', () => {
  it('keeps workspace persistence event-driven instead of using a heartbeat', () => {
    const value = source('src/components/app/WorkspaceActivitySync.tsx');
    expect(value).not.toContain('window.setInterval');
    expect(value).toContain("subscribeWorkspaceActivity(schedule)");
    expect(value).toContain("document.addEventListener('visibilitychange'");
    expect(value).toContain('REMOTE_PULL_COOLDOWN_MS');
    expect(value).toContain('pullRemote: false');
  });

  it('does not continuously refetch stable or hidden Cyber Lab snapshots', () => {
    const value = source('src/lib/labs/client.ts');
    expect(value).not.toContain('LABS_CACHE_TTL_MS');
    expect(value).toContain('snapshotNeedsProgressRefresh');
    expect(value).toContain('TRANSITIONAL_LAB_STATUSES');
    expect(value).toContain('canRefreshProgressFromThisDocument');
    expect(value).toContain("document.visibilityState === 'visible'");
  });

  it('polls ordinary lab readiness only while progress is unresolved and visible', () => {
    const value = source('src/components/labs/LabAccessReadinessBanner.tsx');
    expect(value).toContain('needsAutomaticRefresh');
    expect(value).toContain("document.visibilityState === 'visible'");
    expect(value).not.toContain('window.setInterval(() => void refresh(), 4_000)');
  });

  it('uses one shared visible-only Operation polling owner', () => {
    const provider = source('src/components/operations/OperationRunProvider.tsx');
    expect(provider).toContain('needsProgressPolling');
    expect(provider).toContain("document.visibilityState === 'visible'");
    expect(provider).toContain('/reconcile');
    expect(provider).toContain('window.setInterval');

    for (const path of [
      'src/components/operations/OperationRunStrip.tsx',
      'src/components/operations/OperationLabRuntimePanel.tsx',
      'src/components/operations/OperationTopologyBuild.tsx',
    ]) {
      const value = source(path);
      expect(value).not.toContain('window.setInterval');
      expect(value).not.toContain("fetch(`/api/operations/runs/${encodeURIComponent(runId)}`");
    }
  });
});
