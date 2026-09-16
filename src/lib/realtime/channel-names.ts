export function collaborationChannelName(collaborationId: string) {
  return `oxsig:collaboration:${collaborationId}`;
}

export function storyboardChannelName(storyboardId: string) {
  return `oxsig:board:${storyboardId}`;
}

export function liveTerminalChannelName(collaborationId: string, bindingId: string, leaseId: string) {
  return `oxsig:live-terminal:${collaborationId}:${bindingId}:${leaseId}`;
}
