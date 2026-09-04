import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let assertCollaborationObjectKey: typeof import('./server').assertCollaborationObjectKey;
let collaborationObjectPrefix: typeof import('./server').collaborationObjectPrefix;

beforeAll(async () => {
  const server = await import('./server');
  assertCollaborationObjectKey = server.assertCollaborationObjectKey;
  collaborationObjectPrefix = server.collaborationObjectPrefix;
});

describe('collaboration object key validation', () => {
  const collaborationId = '11111111-2222-3333-4444-555555555555';

  it('builds the expected collaboration prefix', () => {
    expect(collaborationObjectPrefix(collaborationId)).toBe(`collaborations/${collaborationId}/`);
  });

  it('accepts a key within the collaboration namespace', () => {
    const key = `collaborations/${collaborationId}/attachments/diagram.png`;
    expect(assertCollaborationObjectKey(collaborationId, key)).toBe(key);
  });

  it('rejects keys outside the collaboration namespace', () => {
    const key = 'collaborations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/attachments/diagram.png';
    expect(() => assertCollaborationObjectKey(collaborationId, key)).toThrow('INVALID_COLLABORATION_OBJECT_KEY');
  });

  it('rejects traversal segments', () => {
    const key = `collaborations/${collaborationId}/attachments/../secret.txt`;
    expect(() => assertCollaborationObjectKey(collaborationId, key)).toThrow('INVALID_COLLABORATION_OBJECT_KEY');
  });

  it.each(['\r', '\n', '\0'])('rejects control character %j in object keys', (control) => {
    const key = `collaborations/${collaborationId}/attachments/file${control}.txt`;
    expect(() => assertCollaborationObjectKey(collaborationId, key)).toThrow('INVALID_COLLABORATION_OBJECT_KEY');
  });
});
