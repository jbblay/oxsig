export type LabDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type LabRuntimeKind = 'container' | 'vm';

export type LabInstanceStatus =
  | 'created'
  | 'provisioning'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'resetting'
  | 'destroying'
  | 'destroyed'
  | 'failed';

export type LabDefinition = {
  slug: string;
  name: string;
  category: string;
  description: string;
  difficulty: LabDifficulty;
  runtime: LabRuntimeKind;
  estimatedMemoryMb: number;
  estimatedCpu: number;
  objectives: string[];
  available: boolean;
};

export type LabRuntimeCapabilities = {
  provider: 'unconfigured' | 'docker' | 'vm' | 'aws-ec2';
  configured: boolean;
  supportsContainers: boolean;
  supportsVMs: boolean;
  supportsTerminal: boolean;
  supportsReset: boolean;
};
