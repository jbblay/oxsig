export type PreparedEnvironmentReset = {
  environmentId: string;
  status: string;
  phase: string;
  error?: string;
};

const POLL_MS = 5_000;
const MAX_WAIT_MS = 12 * 60_000;

export async function finishReusableEnvironmentReset(args: {
  runId: string;
  csrfToken: string;
  initial?: PreparedEnvironmentReset;
  onProgress?: (reset: PreparedEnvironmentReset) => void;
}) {
  let reset = args.initial;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (!reset || (reset.status !== 'available' && reset.status !== 'failed')) {
    if (Date.now() >= deadline) {
      throw new Error('The environment reset is still running. It remains quarantined and will not be reused until verification finishes.');
    }
    await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
    const response = await fetch(`/api/operations/runs/${encodeURIComponent(args.runId)}/reset`, {
      method: 'POST',
      headers: { 'x-csrf-token': args.csrfToken },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Could not progress the reusable environment reset.');
    reset = body.reset as PreparedEnvironmentReset;
    args.onProgress?.(reset);
  }

  if (reset.status === 'failed') {
    throw new Error(reset.error || 'Environment reset failed. The slot is quarantined for maintenance.');
  }
  return reset;
}
