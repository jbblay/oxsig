import { describe, expect, it } from 'vitest';
import { liveWorkspaceResourceHref } from './LiveWorkspaceResourceCard';

describe('liveWorkspaceResourceHref', () => {
  it('routes each workspace resource to its canonical Oxsig surface', () => {
    expect(liveWorkspaceResourceHref({ type: 'lab-instance' })).toBe('/labs');
    expect(liveWorkspaceResourceHref({ type: 'academy-course' })).toBe('/academy');
    expect(liveWorkspaceResourceHref({ type: 'storyboard' })).toBe('/collab/storyboards');
    expect(liveWorkspaceResourceHref({ type: 'vault-item' })).toBe('/vault');
    expect(liveWorkspaceResourceHref({ type: 'infrastructure-design' })).toBe('/manage');
  });
});
