export function collaborationChannelName(collaborationId: string) {
  return `oxsig:collaboration:${collaborationId}`;
}

export function collaborationSignalChannelName(collaborationId: string) {
  return `oxsig:collaboration:${collaborationId}:signals`;
}

export function storyboardChannelName(storyboardId: string) {
  return `oxsig:board:${storyboardId}`;
}

export function storyboardSignalChannelName(storyboardId: string) {
  return `oxsig:board:${storyboardId}:signals`;
}

export function liveTerminalChannelName(collaborationId: string, bindingId: string, leaseId: string) {
  return `oxsig:live-terminal:${collaborationId}:${bindingId}:${leaseId}`;
}
