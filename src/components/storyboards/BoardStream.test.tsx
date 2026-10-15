import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: async () => 'csrf' }));
import BoardStream from './BoardStream';
const stop = vi.fn();
const media = { getTracks: () => [{ stop }] };
let resolveMedia: (value: any) => void;
beforeEach(() => {
  vi.stubGlobal('RTCPeerConnection', class {});
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(() => new Promise(resolve => { resolveMedia = resolve; })),
  } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ session: 'session', iceServers: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Board stream cleanup', () => {
  it('does not request microphone or camera on mount', () => {
    render(<BoardStream boardId="board" owner={true} canvas={null} />);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
  it('does not offer presentation controls to viewers', () => {
    render(<BoardStream boardId="board" owner={false} canvas={null} />);
    expect(screen.queryByText('Present Board')).toBeNull();
    expect(screen.getByText('Watch live')).toBeTruthy();
  });
  it('stops late permission results after leaving during capture setup', async () => {
    const canvas = document.createElement('canvas');
    canvas.captureStream = vi.fn();
    render(<BoardStream boardId="board" owner={true} canvas={canvas} />);
    fireEvent.click(screen.getByText('Present Board'));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Leave stream'));
    await act(async () => resolveMedia(media));
    expect(stop).toHaveBeenCalledOnce();
    expect(canvas.captureStream).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ keepalive: true }));
  });
});
