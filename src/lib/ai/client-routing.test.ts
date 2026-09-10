import { describe, expect, it } from 'vitest';
import {
  AI_HELPER_OPEN_EVENT,
  AI_PRACTITIONER_OPEN_EVENT,
  getAiOpenEvent,
  getAiSurface,
} from './client-routing';

describe('contextual AI routing', () => {
  it('uses AI Practitioner throughout the Cyber Lab workspace', () => {
    expect(getAiSurface('/labs')).toBe('practitioner');
    expect(getAiSurface('/labs/linux-basics')).toBe('practitioner');
    expect(getAiOpenEvent('/labs')).toBe(AI_PRACTITIONER_OPEN_EVENT);
  });

  it.each(['/home', '/operations', '/warroom', '/collab/storyboards', '/vault'])(
    'uses the global AI Helper outside Cyber Lab: %s',
    (pathname) => {
      expect(getAiSurface(pathname)).toBe('helper');
      expect(getAiOpenEvent(pathname)).toBe(AI_HELPER_OPEN_EVENT);
    },
  );
});
