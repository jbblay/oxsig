export const COLLABORATION_BOTTOM_THRESHOLD_PX = 96;

export type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export type NewMessageDisposition = 'none' | 'follow' | 'announce';

export function isNearConversationBottom(
  metrics: ScrollMetrics,
  threshold = COLLABORATION_BOTTOM_THRESHOLD_PX
) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export function newMessageDisposition(
  previousLastMessageId: string | null,
  nextLastMessageId: string | null,
  nearBottom: boolean
): NewMessageDisposition {
  if (!nextLastMessageId || nextLastMessageId === previousLastMessageId) return 'none';
  return nearBottom ? 'follow' : 'announce';
}

export function collaborationScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth';
}
