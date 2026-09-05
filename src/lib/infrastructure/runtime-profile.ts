import { z } from 'zod';
import { LAB_CATALOG } from '../labs/catalog';

export const RUNTIME_ARCHITECTURES = ['x86_64'] as const;
export type RuntimeArchitecture = (typeof RUNTIME_ARCHITECTURES)[number];

export const RUNTIME_RESOURCE_CLASSES = ['lab-small', 'lab-medium', 'lab-large'] as const;
export type RuntimeResourceClass = (typeof RUNTIME_RESOURCE_CLASSES)[number];

export const RUNTIME_ACCESS_MODES = ['terminal', 'desktop'] as const;
export type RuntimeAccessMode = (typeof RUNTIME_ACCESS_MODES)[number];

export const runtimeProfileSelectionSchema = z.object({
  profileId: z.string().trim().min(1).max(120),
  architecture: z.enum(RUNTIME_ARCHITECTURES),
  resourceClass: z.enum(RUNTIME_RESOURCE_CLASSES),
  accessMode: z.enum(RUNTIME_ACCESS_MODES),
}).strict();

export type RuntimeProfileSelection = z.infer<typeof runtimeProfileSelectionSchema>;

export type RuntimeProfileDefinition = {
  id: string;
  label: string;
  osFamily: string;
  platform: 'linux' | 'windows';
  allowedKinds: readonly ('client' | 'server')[];
  supportedArchitectures: readonly RuntimeArchitecture[];
  supportedAccessModes: readonly RuntimeAccessMode[];
  recommendedResourceClass: RuntimeResourceClass;
  labSlug?: string;
  availabilityNote?: string;
};

export const RUNTIME_PROFILE_CATALOG: readonly RuntimeProfileDefinition[] = [
  {
    id: 'ubuntu-24-04',
    label: 'Ubuntu 24.04',
    osFamily: 'ubuntu',
    platform: 'linux',
    allowedKinds: ['client', 'server'],
    supportedArchitectures: ['x86_64'],
    supportedAccessModes: ['terminal'],
    recommendedResourceClass: 'lab-small',
    labSlug: 'ubuntu-security-lab',
  },
  {
    id: 'amazon-linux-2023',
    label: 'Amazon Linux 2023',
    osFamily: 'amazon-linux',
    platform: 'linux',
    allowedKinds: ['client', 'server'],
    supportedArchitectures: ['x86_64'],
    supportedAccessModes: ['terminal'],
    recommendedResourceClass: 'lab-small',
    labSlug: 'amazon-linux-cloud-lab',
  },
  {
    id: 'rocky-linux-9',
    label: 'Rocky Linux 9',
    osFamily: 'rocky',
    platform: 'linux',
    allowedKinds: ['client', 'server'],
    supportedArchitectures: ['x86_64'],
    supportedAccessModes: ['terminal'],
    recommendedResourceClass: 'lab-small',
    labSlug: 'rocky-linux-rhcsa-lab',
  },
  {
    id: 'kali-linux-2026-2',
    label: 'Kali Linux 2026.2',
    osFamily: 'kali',
    platform: 'linux',
    allowedKinds: ['client'],
    supportedArchitectures: ['x86_64'],
    supportedAccessModes: ['terminal', 'desktop'],
    recommendedResourceClass: 'lab-medium',
    labSlug: 'kali-security-lab',
  },
  {
    id: 'windows-server-2022',
    label: 'Windows Server 2022',
    osFamily: 'windows',
    platform: 'windows',
    allowedKinds: ['server'],
    supportedArchitectures: ['x86_64'],
    supportedAccessModes: ['terminal', 'desktop'],
    recommendedResourceClass: 'lab-medium',
    labSlug: 'windows-server-security-lab',
  },
  {
    id: 'windows-11',
    label: 'Windows 11',
    osFamily: 'windows',
    platform: 'windows',
    allowedKinds: ['client'],
    supportedArchitectures: ['x86_64'],
    supportedAccessModes: ['terminal', 'desktop'],
    recommendedResourceClass: 'lab-medium',
    availabilityNote: 'No controlled OXSIG runtime adapter is mapped for Windows 11 yet.',
  },
] as const;

const profileById = new Map(RUNTIME_PROFILE_CATALOG.map((profile) => [profile.id, profile]));
const labBySlug = new Map(LAB_CATALOG.map((lab) => [lab.slug, lab]));

export function getRuntimeProfile(profileId?: string) {
  return profileId ? profileById.get(profileId) : undefined;
}

export function getRuntimeProfileAvailability(profileId?: string) {
  const profile = getRuntimeProfile(profileId);
  if (!profile) {
    return { mapped: false, available: false, note: 'Unknown runtime profile.' } as const;
  }

  if (!profile.labSlug) {
    return {
      mapped: false,
      available: false,
      note: profile.availabilityNote || 'No controlled OXSIG runtime adapter is mapped for this profile yet.',
    } as const;
  }

  const lab = labBySlug.get(profile.labSlug);
  if (!lab) {
    return { mapped: false, available: false, note: 'The mapped OXSIG lab definition is missing.' } as const;
  }

  return {
    mapped: true,
    available: lab.available,
    labSlug: lab.slug,
    note: lab.available ? undefined : lab.availabilityNote || 'The mapped OXSIG lab is currently unavailable.',
  } as const;
}

export function inspectRuntimeProfileSelection(
  kind: 'client' | 'server' | 'router' | 'switch' | 'firewall',
  selection?: RuntimeProfileSelection,
) {
  if (!selection) return { valid: true, errors: [] as string[], warnings: [] as string[] };

  const profile = getRuntimeProfile(selection.profileId);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!profile) {
    errors.push(`Runtime profile ${selection.profileId} is not recognized.`);
    return { valid: false, errors, warnings };
  }

  if (kind !== 'client' && kind !== 'server') {
    errors.push(`${profile.label} can only be assigned to compute nodes.`);
  } else if (!profile.allowedKinds.includes(kind)) {
    errors.push(`${profile.label} is not compatible with a ${kind} node.`);
  }

  if (!profile.supportedArchitectures.includes(selection.architecture)) {
    errors.push(`${profile.label} does not support ${selection.architecture}.`);
  }

  if (!profile.supportedAccessModes.includes(selection.accessMode)) {
    errors.push(`${profile.label} does not support ${selection.accessMode} access.`);
  }

  const availability = getRuntimeProfileAvailability(profile.id);
  if (!availability.available && availability.note) warnings.push(availability.note);

  return { valid: errors.length === 0, errors, warnings, profile, availability };
}

export function defaultRuntimeProfileSelection(profileId: string): RuntimeProfileSelection | undefined {
  const profile = getRuntimeProfile(profileId);
  if (!profile) return undefined;
  return {
    profileId: profile.id,
    architecture: profile.supportedArchitectures[0],
    resourceClass: profile.recommendedResourceClass,
    accessMode: profile.supportedAccessModes[0],
  };
}
