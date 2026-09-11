export type OperationLifecycleVoiceStage =
  | 'provisioning'
  | 'operator-ready'
  | 'dc-ready'
  | 'workstation-joined'
  | 'mission-ready'
  | 'paused'
  | 'failed'
  | 'destroying'
  | 'destroyed';

type LifecycleVoiceNode = {
  key: string;
  status: string;
};

type LifecycleVoiceRun = {
  operationSlug: string;
  status: string;
  metadata?: { lifecycleState?: string };
  nodes: LifecycleVoiceNode[];
};

export type OperationLifecycleVoiceCue = {
  stage: OperationLifecycleVoiceStage;
  label: string;
  text: string;
};

const BLACK_DOMAIN_CUES: Record<OperationLifecycleVoiceStage, Omit<OperationLifecycleVoiceCue, 'stage'>> = {
  provisioning: {
    label: 'Provisioning',
    text: 'Black Domain provisioning. Isolated operation nodes are launching. OXSIG is verifying Systems Manager and guest readiness.',
  },
  'operator-ready': {
    label: 'Operator ready',
    text: 'Operator station ready. The domain controller is still preparing Active Directory services.',
  },
  'dc-ready': {
    label: 'Domain controller ready',
    text: 'Domain controller ready. Active Directory, DNS, and Kerberos checks passed. Workstation domain join is in progress.',
  },
  'workstation-joined': {
    label: 'Workstation joined',
    text: 'Workstation joined to Black Domain. Final operation readiness checks are running.',
  },
  'mission-ready': {
    label: 'Mission ready',
    text: 'Mission ready. Operator, domain controller, and workstation are verified. Begin the Black Domain investigation.',
  },
  paused: {
    label: 'Operation paused',
    text: 'Operation paused. All Black Domain machines are preserved. Resume when you are ready to continue.',
  },
  failed: {
    label: 'Runtime failed',
    text: 'Black Domain runtime failed. Review the environment error before retrying the operation.',
  },
  destroying: {
    label: 'Destroying',
    text: 'Black Domain shutdown started. OXSIG is terminating the operation machines.',
  },
  destroyed: {
    label: 'Operation ended',
    text: 'Black Domain ended. The operation machines have been destroyed.',
  },
};

export function operationLifecycleVoiceStage(run: LifecycleVoiceRun): OperationLifecycleVoiceStage {
  if (run.metadata?.lifecycleState === 'paused') return 'paused';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'destroying') return 'destroying';
  if (run.status === 'destroyed') return 'destroyed';

  const ready = (key: string) => run.nodes.some((node) => node.key === key && node.status === 'running');
  const allReady = run.nodes.length > 0 && run.nodes.every((node) => node.status === 'running');

  if (run.status === 'running' && allReady) return 'mission-ready';
  if (ready('workstation')) return 'workstation-joined';
  if (ready('dc')) return 'dc-ready';
  if (ready('operator')) return 'operator-ready';
  return 'provisioning';
}

export function operationLifecycleVoiceCue(run: LifecycleVoiceRun): OperationLifecycleVoiceCue | null {
  if (run.operationSlug !== 'black-domain') return null;
  const stage = operationLifecycleVoiceStage(run);
  return { stage, ...BLACK_DOMAIN_CUES[stage] };
}
