import { describe, expect, it } from 'vitest';
import {
  contextualAiOpenEvent,
  contextualAiSurfaceForPathname,
  contextualAiSurfaceLabel,
} from './context-surface';

describe('contextual AI surface routing', () => {
  it('routes Cyber Lab paths to AI Practitioner', () => {
    expect(contextualAiSurfaceForPathname('/labs')).toBe('practitioner');
    expect(contextualAiSurfaceForPathname('/labs/session')).toBe('practitioner');
    expect(contextualAiOpenEvent('/labs')).toBe('oxsig:ai-practitioner:open');
    expect(contextualAiSurfaceLabel('/labs')).toBe('AI Practitioner');
  });

  it('routes non-lab paths to AI Helper', () => {
    expect(contextualAiSurfaceForPathname('/home')).toBe('helper');
    expect(contextualAiOpenEvent('/collab/storyboards')).toBe('oxsig:ai-helper:open');
    expect(contextualAiSurfaceLabel('/operations')).toBe('AI Helper');
  });
});
