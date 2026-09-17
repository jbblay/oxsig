export type ContextualAiSurface = 'helper' | 'practitioner';

export function contextualAiSurfaceForPathname(pathname: string): ContextualAiSurface {
  return pathname.startsWith('/labs') ? 'practitioner' : 'helper';
}

export function contextualAiOpenEvent(pathname: string): 'oxsig:ai-helper:open' | 'oxsig:ai-practitioner:open' {
  return contextualAiSurfaceForPathname(pathname) === 'practitioner'
    ? 'oxsig:ai-practitioner:open'
    : 'oxsig:ai-helper:open';
}

export function contextualAiSurfaceLabel(pathname: string): 'AI Helper' | 'AI Practitioner' {
  return contextualAiSurfaceForPathname(pathname) === 'practitioner'
    ? 'AI Practitioner'
    : 'AI Helper';
}
