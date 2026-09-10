'use client';

export const AI_HELPER_OPEN_EVENT = 'oxsig:ai-helper:open';
export const AI_PRACTITIONER_OPEN_EVENT = 'oxsig:ai-practitioner:open';

export type AiSurface = 'helper' | 'practitioner';

export function getAiSurface(pathname: string): AiSurface {
  return pathname.startsWith('/labs') ? 'practitioner' : 'helper';
}

export function getAiOpenEvent(pathname: string): typeof AI_HELPER_OPEN_EVENT | typeof AI_PRACTITIONER_OPEN_EVENT {
  return getAiSurface(pathname) === 'practitioner' ? AI_PRACTITIONER_OPEN_EVENT : AI_HELPER_OPEN_EVENT;
}

export function openAiForPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(getAiOpenEvent(pathname)));
}
