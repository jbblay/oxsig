export type OperationMode = 'practice' | 'walkthrough' | 'challenge' | 'warroom';

export type Operation = {
  slug: string;
  name: string;
  codename: string;
  summary: string;
  domain: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  players: string;
  modes: OperationMode[];
  objectives: string[];
  evidence: string[];
  topology: string[];
  tags: string[];
};

export const operations: Operation[] = [
  {
    slug: 'black-domain',
    name: 'Active Directory Pentest',
    codename: 'Operation Black Domain',
    summary: 'Enumerate a Windows domain, obtain a foothold, move laterally, and prove domain-level compromise in a contained lab.',
    domain: 'Active Directory',
    difficulty: 'Advanced',
    estimatedMinutes: 120,
    players: '1–4',
    modes: ['practice', 'walkthrough', 'challenge', 'warroom'],
    objectives: ['Discover the domain controller', 'Enumerate users and services', 'Obtain an initial foothold', 'Escalate or move laterally', 'Submit domain compromise evidence'],
    evidence: ['Recon output', 'Compromised identity', 'Privilege proof', 'Final domain evidence'],
    topology: ['Kali operator', 'Windows workstation', 'Domain controller'],
    tags: ['AD', 'Kerberos', 'SMB', 'Lateral movement'],
  },
  {
    slug: 'ghost-shell',
    name: 'Linux Privilege Escalation',
    codename: 'Operation Ghost Shell',
    summary: 'Start with a low-privilege Linux shell, enumerate the host, find a viable path, and obtain root with clean evidence.',
    domain: 'Linux',
    difficulty: 'Intermediate',
    estimatedMinutes: 60,
    players: '1–4',
    modes: ['practice', 'walkthrough', 'challenge', 'warroom'],
    objectives: ['Establish the shell', 'Enumerate escalation paths', 'Exploit one valid path', 'Prove root access'],
    evidence: ['Enumeration output', 'Escalation path', 'Root identity proof'],
    topology: ['Kali operator', 'Linux target'],
    tags: ['Linux', 'SUID', 'sudo', 'systemd'],
  },
  {
    slug: 'pivot-point',
    name: 'Internal Network Pivoting',
    codename: 'Operation Pivot Point',
    summary: 'Compromise a reachable host, discover a hidden network, build a pivot, and reach a second target through the foothold.',
    domain: 'Network',
    difficulty: 'Advanced',
    estimatedMinutes: 90,
    players: '1–4',
    modes: ['practice', 'walkthrough', 'challenge', 'warroom'],
    objectives: ['Compromise the edge target', 'Discover the hidden subnet', 'Establish the pivot', 'Reach the internal target'],
    evidence: ['Foothold proof', 'Route discovery', 'Pivot configuration', 'Internal target proof'],
    topology: ['Kali operator', 'Edge target', 'Internal target'],
    tags: ['Pivoting', 'Routing', 'Tunneling', 'Lateral movement'],
  },
  {
    slug: 'red-web',
    name: 'Web Application Pentest',
    codename: 'Operation Red Web',
    summary: 'Map an application, test trust boundaries, exploit a vulnerable flow, and collect reproducible request/response evidence.',
    domain: 'Web',
    difficulty: 'Intermediate',
    estimatedMinutes: 75,
    players: '1–4',
    modes: ['practice', 'walkthrough', 'challenge', 'warroom'],
    objectives: ['Map the attack surface', 'Identify a vulnerable input', 'Exploit the flaw', 'Capture reproducible evidence'],
    evidence: ['Request', 'Response', 'Exploit payload', 'Impact proof'],
    topology: ['Operator terminal', 'Web application', 'Internal service'],
    tags: ['HTTP', 'SSRF', 'XXE', 'Injection'],
  },
  {
    slug: 'dead-disk',
    name: 'Digital Forensics Investigation',
    codename: 'Operation Dead Disk',
    summary: 'Validate evidence integrity, inspect a disk image, recover artifacts, and produce an evidence-backed incident finding.',
    domain: 'Forensics',
    difficulty: 'Intermediate',
    estimatedMinutes: 90,
    players: '1–4',
    modes: ['practice', 'walkthrough', 'challenge', 'warroom'],
    objectives: ['Verify evidence integrity', 'Triage the image', 'Recover relevant artifacts', 'Build the incident finding'],
    evidence: ['Hash verification', 'Recovered artifact', 'Metadata', 'Finding summary'],
    topology: ['Analyst workstation', 'Evidence image'],
    tags: ['dd', 'Hashing', 'Carving', 'Metadata'],
  },
  {
    slug: 'cloudfall',
    name: 'Cloud Misconfiguration',
    codename: 'Operation Cloudfall',
    summary: 'Inspect a deliberately vulnerable cloud environment, identify exposed trust, and prove impact without leaving the lab boundary.',
    domain: 'Cloud',
    difficulty: 'Advanced',
    estimatedMinutes: 90,
    players: '1–4',
    modes: ['practice', 'walkthrough', 'challenge', 'warroom'],
    objectives: ['Enumerate exposed resources', 'Identify the trust failure', 'Demonstrate impact', 'Capture remediation evidence'],
    evidence: ['Resource inventory', 'Misconfiguration proof', 'Impact proof', 'Remediation note'],
    topology: ['Operator terminal', 'Cloud account', 'Workload'],
    tags: ['AWS', 'IAM', 'Metadata', 'Cloud'],
  },
];

export function getOperation(slug: string) {
  return operations.find((operation) => operation.slug === slug) ?? null;
}
