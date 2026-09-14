import { describe, expect, it, vi } from 'vitest';
import {
  assertTerminalWorkspaceControl,
  terminalFrameRequiresWorkspaceControlRevalidation,
} from './terminal-workspace-control.js';

const authorization = {
  collaborationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  participantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  bindingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  labInstanceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  leaseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  surface: 'terminal',
} as const;

function ssmFrame(messageType: string) {
  const frame = Buffer.alloc(120);
  Buffer.from(messageType, 'utf8').copy(frame, 4, 0, 32);
  return frame;
}

describe('custom terminal bridge workspace control', () => {
  it('requires live authorization for SSM input frames and malformed binary frames', () => {
    expect(terminalFrameRequiresWorkspaceControlRevalidation(ssmFrame('input_stream_data'))).toBe(true);
    expect(terminalFrameRequiresWorkspaceControlRevalidation(Buffer.alloc(20))).toBe(true);
  });

  it('allows protocol acknowledgements and the initial JSON token frame without another lookup', () => {
    expect(terminalFrameRequiresWorkspaceControlRevalidation(ssmFrame('acknowledge'))).toBe(false);
    expect(terminalFrameRequiresWorkspaceControlRevalidation('{"TokenValue":"opaque"}')).toBe(false);
  });

  it('binds live authorization to the exact workspace, controller, binding, lease, and lab', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ '?column?': 1 }] });
    await expect(assertTerminalWorkspaceControl({ query }, authorization)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('lease.id=$4');
    expect(sql).toContain('lease.lab_instance_id=$5');
    expect(sql).toContain("lease.status='active'");
    expect(sql).toContain('lease.expires_at > NOW()');
    expect(sql).toContain("resource.status='attached'");
    expect(params).toEqual([
      authorization.collaborationId,
      authorization.participantId,
      authorization.bindingId,
      authorization.leaseId,
      authorization.labInstanceId,
    ]);
  });

  it('fails closed after the live lease or attachment becomes invalid', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(assertTerminalWorkspaceControl({ query }, authorization)).rejects.toThrow(
      'Shared terminal control lease is no longer active.',
    );
  });

  it('rejects shared control when database authorization is unavailable', async () => {
    await expect(assertTerminalWorkspaceControl(null, authorization)).rejects.toThrow(
      'Database authorization is unavailable for shared terminal control.',
    );
  });
});
