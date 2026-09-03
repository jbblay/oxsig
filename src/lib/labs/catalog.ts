import type { LabDefinition } from './types';

export const LAB_CATALOG: LabDefinition[] = [
  {
    slug: 'ubuntu-security-lab',
    name: 'Ubuntu Security Lab',
    category: 'Linux Security',
    description: 'A disposable Ubuntu VM for the first Oxsig cloud-lab vertical slice.',
    difficulty: 'beginner',
    runtime: 'vm',
    estimatedMemoryMb: 1024,
    estimatedCpu: 2,
    objectives: [
      'Start a real cloud VM from the Oxsig Lab canvas',
      'Observe its lifecycle from provisioning to running',
      'Run commands through the managed lab channel when SSM is enabled',
      'Stop or destroy the VM when the session is finished',
    ],
    available: true,
  },
];
