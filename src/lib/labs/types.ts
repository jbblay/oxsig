export type LabDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type LabRuntimeKind = 'container' | 'vm';
export type LabOsFamily = 'ubuntu' | 'amazon-linux' | 'rocky' | 'kali' | 'windows';
export type LabPlatform = 'linux' | 'windows';
export type LabShell = 'bash' | 'powershell';
export type LabAccessMode = 'terminal' | 'desktop';

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
  shortName: string;
  category: string;
  description: string;
  difficulty: LabDifficulty;
  runtime: LabRuntimeKind;
  osFamily: LabOsFamily;
  platform: LabPlatform;
  shell: LabShell;
  accessModes: LabAccessMode[];
  defaultAccessMode: LabAccessMode;
  recommendedInstanceType: string;
  desktopInstanceType?: string;
  defaultCommand: string;
  estimatedMemoryMb: number;
  estimatedCpu: number;
  objectives: string[];
  available: boolean;
  availabilityNote?: string;
  marketplaceProductCode?: string;
};

export type LabRuntimeCapabilities = {
  provider: 'unconfigured' | 'docker' | 'vm' | 'aws-ec2';
  configured: boolean;
  supportsContainers: boolean;
  supportsVMs: boolean;
  supportsTerminal: boolean;
  supportsReset: boolean;
};
