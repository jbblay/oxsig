import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ executeLabCommand: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('./aws-runtime', () => ({ executeLabCommand: mocks.executeLabCommand }));

import { inspectDesktopService } from './desktop-runtime';

const instanceId = 'i-0123456789abcdef0';

describe('inspectDesktopService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attests a Linux desktop service only when the expected listener is loopback-only', async () => {
    mocks.executeLabCommand.mockResolvedValue({
      stdout: 'installed=true\nstate=active\nmarker=true\nlistener=127.0.0.1:5901\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await inspectDesktopService(instanceId, 'linux');

    expect(mocks.executeLabCommand).toHaveBeenCalledWith(instanceId, expect.stringContaining('5901'), 'linux');
    expect(result).toMatchObject({
      serviceName: 'oxsig-desktop-vnc.service',
      expectedPort: 5901,
      serviceInstalled: true,
      serviceRunning: true,
      readyMarkerPresent: true,
      listenerPresent: true,
      loopbackOnly: true,
      ready: true,
    });
  });

  it('treats a non-loopback listener as not ready even when the service is running', async () => {
    mocks.executeLabCommand.mockResolvedValue({
      stdout: 'installed=true\nstate=active\nmarker=true\nlistener=0.0.0.0:5901\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await inspectDesktopService(instanceId, 'linux');

    expect(result.listenerPresent).toBe(true);
    expect(result.loopbackOnly).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('parses Windows TightVNC service and loopback listener state', async () => {
    mocks.executeLabCommand.mockResolvedValue({
      stdout: 'installed=True\r\nstate=Running\r\nmarker=True\r\nlistener=::1\r\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await inspectDesktopService(instanceId, 'windows');

    expect(result).toMatchObject({
      serviceName: 'tvnserver',
      expectedPort: 5900,
      serviceRunning: true,
      listenerAddress: '::1',
      loopbackOnly: true,
      ready: true,
    });
  });

  it('records a missing listener as an observed not-ready state', async () => {
    mocks.executeLabCommand.mockResolvedValue({
      stdout: 'installed=true\nstate=active\nmarker=true\nlistener=\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await inspectDesktopService(instanceId, 'linux');

    expect(result.listenerPresent).toBe(false);
    expect(result.listenerAddress).toBeNull();
    expect(result.ready).toBe(false);
  });
});
