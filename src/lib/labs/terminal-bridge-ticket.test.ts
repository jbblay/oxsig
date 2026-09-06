import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTerminalBridgeTicket, verifyTerminalBridgeTicket } from './terminal-bridge-ticket.js';

const ORIGINAL_SECRET = process.env.OXSIG_TERMINAL_BRIDGE_SECRET;

beforeEach(() => {
  process.env.OXSIG_TERMINAL_BRIDGE_SECRET = 'test-secret-that-is-long-enough-for-terminal-bridge-tests';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
  else process.env.OXSIG_TERMINAL_BRIDGE_SECRET = ORIGINAL_SECRET;
});

describe('terminal bridge tickets', () => {
  it('encrypts and restores the Session Manager bridge payload', () => {
    const streamUrl = 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-123?role=publish_subscribe';
    const ticket = createTerminalBridgeTicket({
      streamUrl,
      region: 'eu-central-1',
      sessionId: 'session-123',
      target: 'i-0123456789abcdef0',
    });

    expect(ticket).not.toContain('ssmmessages');
    expect(ticket).not.toContain('session-123');
    expect(verifyTerminalBridgeTicket(ticket)).toMatchObject({
      streamUrl,
      region: 'eu-central-1',
      sessionId: 'session-123',
      target: 'i-0123456789abcdef0',
    });
  });

  it('encrypts the exact Live Workspace control binding without exposing it in the URL ticket', () => {
    const workspaceControl = {
      collaborationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      participantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      bindingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      labInstanceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      leaseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      surface: 'terminal',
    };
    const ticket = createTerminalBridgeTicket({
      streamUrl: 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-shared?role=publish_subscribe',
      region: 'eu-central-1',
      sessionId: 'session-shared',
      target: 'i-0123456789abcdef0',
      workspaceControl,
    });

    expect(ticket).not.toContain(workspaceControl.collaborationId);
    expect(ticket).not.toContain(workspaceControl.participantId);
    expect(ticket).not.toContain(workspaceControl.leaseId);
    expect(verifyTerminalBridgeTicket(ticket)).toMatchObject({ workspaceControl });
  });

  it('rejects an incomplete Live Workspace control binding before minting a ticket', () => {
    expect(() => createTerminalBridgeTicket({
      streamUrl: 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-shared?role=publish_subscribe',
      region: 'eu-central-1',
      sessionId: 'session-shared',
      target: 'i-0123456789abcdef0',
      workspaceControl: {
        collaborationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        participantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        bindingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        labInstanceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        surface: 'terminal',
      },
    })).toThrow('Invalid Live Workspace terminal control binding');
  });

  it('rejects a modified ticket', () => {
    const ticket = createTerminalBridgeTicket({
      streamUrl: 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-123?role=publish_subscribe',
      region: 'eu-central-1',
      sessionId: 'session-123',
      target: 'i-0123456789abcdef0',
    });
    const parts = ticket.split('.');
    parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('A') ? 'B' : 'A'}`;
    expect(() => verifyTerminalBridgeTicket(parts.join('.'))).toThrow('Invalid terminal bridge ticket');
  });

  it('rejects non-canonical base64url segments', () => {
    const ticket = createTerminalBridgeTicket({
      streamUrl: 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-123?role=publish_subscribe',
      region: 'eu-central-1',
      sessionId: 'session-123',
      target: 'i-0123456789abcdef0',
    });
    const parts = ticket.split('.');
    parts[2] = `${parts[2]}=`;
    expect(() => verifyTerminalBridgeTicket(parts.join('.'))).toThrow('Invalid terminal bridge ticket');
  });

  it('requires the server-generated bridge secret', () => {
    delete process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
    expect(() => createTerminalBridgeTicket({
      streamUrl: 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-123?role=publish_subscribe',
      region: 'eu-central-1',
      sessionId: 'session-123',
      target: 'i-0123456789abcdef0',
    })).toThrow('OXSIG_TERMINAL_BRIDGE_SECRET is unavailable');
  });
});
