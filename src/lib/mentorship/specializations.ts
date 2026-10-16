// Curated path ids are literals (not imports) so this client-safe catalog does
// not pull full course content into the browser bundle. specializations.test.ts
// asserts they match the curated path catalog.
const PROGRAM_PROCESS_PATH_ID = 'program-becomes-process';
const ACTIVE_DIRECTORY_PATH_ID = 'active-directory-operations';

/**
 * Mentoring specializations. `academyEvidence` names the curated-path
 * capabilities that count as Academy proof for the specialization. When it is
 * null, OXSIG has no verified Academy pathway yet, so only externally reviewed
 * professionals can be qualified for it.
 */
export type MentorSpecialization = {
  id: string;
  label: string;
  description: string;
  academyEvidence: null | {
    pathId: string;
    capabilityIds: readonly string[];
    minimumDemonstrated: number;
  };
};

export const MENTOR_SPECIALIZATIONS: readonly MentorSpecialization[] = [
  {
    id: 'linux-systems',
    label: 'Linux systems',
    description: 'Processes, the shell, system calls, services and Linux troubleshooting.',
    academyEvidence: {
      pathId: PROGRAM_PROCESS_PATH_ID,
      capabilityIds: [
        'command-resolution',
        'fork-copy-on-write',
        'execve-elf',
        'virtual-address-space',
        'runtime-startup',
        'process-context',
        'syscalls-scheduling',
        'exit-wait-zombie',
      ],
      minimumDemonstrated: 6,
    },
  },
  {
    id: 'windows-identity',
    label: 'Windows identity & Active Directory',
    description: 'Domains, users and groups, Group Policy, Kerberos and directory security boundaries.',
    academyEvidence: {
      pathId: ACTIVE_DIRECTORY_PATH_ID,
      capabilityIds: [
        'ad-foundations',
        'ad-identities-groups',
        'ad-group-policy',
        'ad-kerberos-auth',
        'ad-security-boundaries',
        'ad-advanced-operations',
      ],
      minimumDemonstrated: 5,
    },
  },
  {
    id: 'networking-dns',
    label: 'Networking & DNS',
    description: 'Addressing, routing, name resolution and network diagnostics.',
    academyEvidence: null,
  },
  {
    id: 'containers-docker',
    label: 'Containers & Docker',
    description: 'Images, containers, ports, volumes and container troubleshooting.',
    academyEvidence: null,
  },
  {
    id: 'cloud-aws',
    label: 'Cloud infrastructure (AWS)',
    description: 'Compute, networking, identity and operations on AWS.',
    academyEvidence: null,
  },
  {
    id: 'security-operations',
    label: 'Security operations',
    description: 'Detection, investigation, hardening and incident response in authorized environments.',
    academyEvidence: null,
  },
  {
    id: 'databases',
    label: 'Databases',
    description: 'Relational databases, backups, performance and data integrity.',
    academyEvidence: null,
  },
  {
    id: 'devops-automation',
    label: 'DevOps & automation',
    description: 'CI/CD, infrastructure as code, scripting and monitoring.',
    academyEvidence: null,
  },
];

export const MENTOR_SPECIALIZATION_IDS = MENTOR_SPECIALIZATIONS.map((item) => item.id) as [string, ...string[]];

export function getMentorSpecialization(id: string): MentorSpecialization | null {
  return MENTOR_SPECIALIZATIONS.find((item) => item.id === id) ?? null;
}

export function mentorSpecializationLabel(id: string): string {
  return getMentorSpecialization(id)?.label ?? id;
}
