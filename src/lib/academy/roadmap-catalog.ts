// One curriculum structure shared by career roadmaps and learning workspaces.
// Only live skills are navigable. Roadmap previews never award progress.
export type CareerId = 'devops' | 'cybersecurity' | 'systems' | 'programming';
export type AcademyModule = {
  id: string;
  title: string;
  summary: string;
  missionIds?: readonly string[];
};
export type AcademySkill = {
  id: string;
  title: string;
  summary: string;
  availability: 'live' | 'planned';
  href?: string;
  modules: readonly AcademyModule[];
};
export type AcademyCareer = {
  id: CareerId;
  title: string;
  subtitle: string;
  skills: readonly AcademySkill[];
};

export const DOCKER_LEARNING_MODULES: readonly AcademyModule[] = [
  { id: 'docker-deploy', title: 'Container deployment', summary: 'Images, containers and published ports', missionIds: ['deploy'] },
  { id: 'docker-repair', title: 'Troubleshooting services', summary: 'Inspecting logs, status and port mappings', missionIds: ['repair'] },
  { id: 'docker-persist', title: 'Persistent storage', summary: 'Named volumes, mounts and durable content', missionIds: ['persist'] },
];

export const ACADEMY_ROADMAPS: Record<CareerId, AcademyCareer> = {
  devops: {
    id: 'devops', title: 'DevOps & Cloud', subtitle: 'Build, deploy and operate real systems.',
    skills: [
      {
        id: 'linux-fundamentals', title: 'Linux Fundamentals', summary: 'Learn to work confidently in a Linux environment.',
        availability: 'planned',
        modules: [
          { id: 'linux-terminal', title: 'Terminal basics', summary: 'Shell navigation and command-line help' },
          { id: 'linux-files', title: 'File management', summary: 'Directories, copying, moving and searching' },
          { id: 'linux-permissions', title: 'Users and permissions', summary: 'Accounts, groups and file ownership' },
          { id: 'linux-processes', title: 'Processes and services', summary: 'Inspecting processes and managing services' },
          { id: 'linux-storage', title: 'Disk management', summary: 'Filesystem usage, mounts and storage' },
        ],
      },
      {
        id: 'networking', title: 'Networking Fundamentals', summary: 'IP addressing, routes and connectivity.',
        availability: 'planned',
        modules: [
          { id: 'network-addresses', title: 'Addresses and interfaces', summary: 'Understand hosts, subnets and interfaces' },
          { id: 'network-routing', title: 'Routing and connectivity', summary: 'Routes, gateways and diagnostics' },
          { id: 'network-services', title: 'Network services', summary: 'DNS, ports and service reachability' },
        ],
      },
      {
        id: 'docker', title: 'Docker', summary: 'Deploy, repair and preserve a container service.',
        availability: 'live', href: '/academy/learn/docker',
        modules: DOCKER_LEARNING_MODULES,
      },
      {
        id: 'kubernetes', title: 'Kubernetes', summary: 'Operate containerized workloads across a cluster.',
        availability: 'planned',
        modules: [
          { id: 'k8s-basics', title: 'Cluster foundations', summary: 'Nodes, pods and deployments' },
          { id: 'k8s-network', title: 'Services and networking', summary: 'Service discovery and connectivity' },
          { id: 'k8s-recovery', title: 'Workload recovery', summary: 'Diagnose and recover unhealthy applications' },
        ],
      },
    ],
  },
  cybersecurity: {
    id: 'cybersecurity', title: 'Cybersecurity', subtitle: 'Investigate, understand and protect systems.',
    skills: [
      { id: 'network-basics', title: 'Network Fundamentals', summary: 'Learn how hosts and networks communicate.', availability: 'planned',
        modules: [{ id: 'cyber-ip', title: 'IP networking', summary: 'Subnets and gateways' }, { id: 'cyber-dns', title: 'DNS and protocols', summary: 'Names and common protocols' }] },
      { id: 'traffic-analysis', title: 'Traffic Analysis', summary: 'Interpret traffic and detect anomalies.', availability: 'planned',
        modules: [{ id: 'traffic-packets', title: 'Packet inspection', summary: 'Read traffic captures' }, { id: 'traffic-incidents', title: 'Incident investigation', summary: 'Follow evidence and identify root causes' }] },
      { id: 'linux-defense', title: 'Linux Security', summary: 'Harden and investigate Linux systems.', availability: 'planned',
        modules: [{ id: 'linux-access', title: 'Access and permissions', summary: 'Reduce unnecessary access' }, { id: 'linux-logs', title: 'Logs and investigation', summary: 'Inspect evidence on the host' }] },
    ],
  },
  systems: {
    id: 'systems', title: 'System Administration', subtitle: 'Configure, manage and troubleshoot computers.',
    skills: [
      { id: 'hardware', title: 'Computer Fundamentals', summary: 'Understand the components of real systems.', availability: 'planned',
        modules: [{ id: 'hardware-components', title: 'Hardware concepts', summary: 'CPU, memory and storage' }] },
      { id: 'linux-admin', title: 'Linux Administration', summary: 'Manage Linux hosts and services.', availability: 'planned',
        modules: [{ id: 'sys-users', title: 'Users and access', summary: 'Manage local identities' }, { id: 'sys-services', title: 'Services', summary: 'Manage system services' }] },
      { id: 'windows-server', title: 'Windows Server', summary: 'Operate and administer Windows servers.', availability: 'planned',
        modules: [{ id: 'windows-admin', title: 'Server administration', summary: 'Roles, features and administration tools' }] },
      { id: 'active-directory', title: 'Active Directory', summary: 'Build and manage a Windows domain.', availability: 'planned',
        modules: [{ id: 'ad-domain', title: 'Domain foundations', summary: 'Domain controllers and DNS' }, { id: 'ad-identities', title: 'Users and groups', summary: 'Directory administration' }, { id: 'ad-policy', title: 'Group Policy', summary: 'Apply settings across computers' }] },
    ],
  },
  programming: {
    id: 'programming', title: 'Programming & Automation', subtitle: 'Build programs and automate repetitive work.',
    skills: [
      { id: 'python', title: 'Python Fundamentals', summary: 'Write and debug Python programs.', availability: 'planned',
        modules: [{ id: 'py-basics', title: 'Python basics', summary: 'Variables and expressions' }, { id: 'py-functions', title: 'Functions and modules', summary: 'Reusable code' }, { id: 'py-files', title: 'Files and errors', summary: 'Read files and handle failures' }] },
      { id: 'automation', title: 'Automation', summary: 'Automate practical engineering operations.', availability: 'planned',
        modules: [{ id: 'auto-scripts', title: 'Practical scripts', summary: 'Repeatable commands' }, { id: 'auto-checks', title: 'Testing automation', summary: 'Verify results and handle failures' }] },
    ],
  },
};

export function getCareerRoadmap(id: string): AcademyCareer | null {
  return Object.prototype.hasOwnProperty.call(ACADEMY_ROADMAPS, id)
    ? ACADEMY_ROADMAPS[id as CareerId]
    : null;
}

export function completedModuleCount(modules: readonly AcademyModule[], verifiedIds: ReadonlySet<string>): number {
  return modules.filter(module => Boolean(module.missionIds?.length) && module.missionIds!.every(id => verifiedIds.has(id))).length;
}

export type RoadmapSkillState = 'planned' | 'locked' | 'active' | 'complete';

function fullyVerified(skill: AcademySkill, verifiedIds: ReadonlySet<string>): boolean {
  const missionIds = skill.modules.flatMap(module => module.missionIds || []);
  return missionIds.length > 0 && missionIds.every(id => verifiedIds.has(id));
}

// Planned curriculum is visible but does not prevent using already-live subjects.
// When new live subjects launch, prior live subjects become actual prerequisites.
export function getSkillRoadmapState(career: AcademyCareer, skillId: string, verifiedIds: ReadonlySet<string>): RoadmapSkillState {
  const index = career.skills.findIndex(skill => skill.id === skillId);
  if (index === -1) return 'planned';
  const skill = career.skills[index];
  if (skill.availability === 'planned') return 'planned';
  if (fullyVerified(skill, verifiedIds)) return 'complete';
  const unfinishedPredecessor = career.skills.slice(0, index).some(
    previous => previous.availability === 'live' && !fullyVerified(previous, verifiedIds),
  );
  return unfinishedPredecessor ? 'locked' : 'active';
}
