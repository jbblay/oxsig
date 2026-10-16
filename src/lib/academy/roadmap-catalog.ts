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
    id: 'devops', title: 'DevOps & Cloud', subtitle: 'Your DevOps engineer roadmap: foundations, delivery and reliable operations.',
    skills: [
      {
        id: 'linux-fundamentals', title: 'Linux Fundamentals', summary: 'Learn to work confidently in a Linux environment.',
        availability: 'planned',
        modules: [
          { id: 'linux-terminal', title: 'Terminal basics', summary: 'Shell navigation and command-line help' },
          { id: 'linux-files', title: 'File management', summary: 'Directories, copying, moving and searching' },
          { id: 'linux-permissions', title: 'Users and permissions', summary: 'Accounts, groups and file ownership' },
          { id: 'linux-processes', title: 'Processes and services', summary: 'Inspecting processes and managing services' },
          { id: 'linux-networking', title: 'Networking', summary: 'Interfaces, routes and connectivity diagnostics' },
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
      { id: 'git', title: 'Git & collaboration', summary: 'Track changes and review work.', availability: 'planned',
        modules: [{ id: 'git-0', title: 'Version control', summary: 'Commits, branches, merges and pull requests' }] },
      { id: 'scripting', title: 'Shell & Python automation', summary: 'Turn repeatable work into scripts.', availability: 'planned',
        modules: [{ id: 'scripting-0', title: 'Shell scripting', summary: 'Pipes, variables, exit codes and safe scripts' }, { id: 'scripting-1', title: 'Python automation', summary: 'Files, APIs, dependencies and tests' }] },
      { id: 'cloud', title: 'Cloud foundations', summary: 'Understand compute, identity and networks.', availability: 'planned',
        modules: [{ id: 'cloud-0', title: 'AWS foundations', summary: 'IAM, VPC, EC2, storage and budgets' }] },
      {
        id: 'docker', title: 'Docker', summary: 'Deploy, repair and preserve a container service.',
        availability: 'live', href: '/academy/learn/docker',
        modules: DOCKER_LEARNING_MODULES,
      },
      { id: 'cicd', title: 'CI/CD pipelines', summary: 'Build, test and deliver changes safely.', availability: 'planned',
        modules: [{ id: 'cicd-0', title: 'Continuous integration', summary: 'Automated checks and artifact builds' }, { id: 'cicd-1', title: 'Delivery', summary: 'Environments, deployment strategies and rollback' }] },
      { id: 'iac', title: 'Infrastructure as code', summary: 'Version and reproduce infrastructure.', availability: 'planned',
        modules: [{ id: 'iac-0', title: 'Terraform', summary: 'Plans, state, modules and safe changes' }, { id: 'iac-1', title: 'Configuration management', summary: 'Idempotent configuration and secrets' }] },
      {
        id: 'kubernetes', title: 'Kubernetes', summary: 'Operate containerized workloads across a cluster.',
        availability: 'planned',
        modules: [
          { id: 'k8s-basics', title: 'Cluster foundations', summary: 'Nodes, pods and deployments' },
          { id: 'k8s-network', title: 'Services and networking', summary: 'Service discovery and connectivity' },
          { id: 'k8s-recovery', title: 'Workload recovery', summary: 'Diagnose and recover unhealthy applications' },
        ],
      },
      { id: 'observability', title: 'Observability', summary: 'Understand systems through signals.', availability: 'planned',
        modules: [{ id: 'observability-0', title: 'Metrics, logs and traces', summary: 'Dashboards, alerting and diagnosis' }] },
      { id: 'devsecops', title: 'DevSecOps', summary: 'Build security into delivery.', availability: 'planned',
        modules: [{ id: 'devsecops-0', title: 'Supply chain and access', summary: 'Image scanning, least privilege, policies and secrets' }] },
      { id: 'reliability', title: 'Reliability engineering', summary: 'Operate services with confidence.', availability: 'planned',
        modules: [{ id: 'reliability-0', title: 'SRE practice', summary: 'SLIs, SLOs, incidents, capacity and recovery' }] },
      { id: 'devops-capstone', title: 'DevOps capstone', summary: 'Connect delivery and operations end to end.', availability: 'planned',
        modules: [{ id: 'devops-capstone-0', title: 'Production service project', summary: 'Design, automate, secure and operate a service' }] },
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
  if (!skill.modules.length || skill.modules.some(module => !module.missionIds?.length)) return false;
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
