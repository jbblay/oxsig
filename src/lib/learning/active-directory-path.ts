import type { AcademyCourse } from '@/lib/academy/types';

export const ACTIVE_DIRECTORY_PATH_ID = 'active-directory-operations';
export const ACTIVE_DIRECTORY_PATH_VERSION = 1;
export const ACTIVE_DIRECTORY_SOURCE_PROMPT = `OXSIG curated path:${ACTIVE_DIRECTORY_PATH_ID}@${ACTIVE_DIRECTORY_PATH_VERSION}`;

export type ActiveDirectoryCapability = {
  id: string;
  title: string;
  outcome: string;
  evidence: string;
  practiceLabel: string;
};

export const ACTIVE_DIRECTORY_CAPABILITIES: ActiveDirectoryCapability[] = [
  {
    id: 'ad-foundations',
    title: 'Domain foundations and scope',
    outcome: 'Explain the role of a domain, domain controller, workstation, directory objects, and the trust boundary represented by the Black Domain environment.',
    evidence: 'Read the live Operation scope and identify the domain, domain controller, workstation, and starting identity without confusing host identity with domain identity.',
    practiceLabel: 'Inspect the live domain scope',
  },
  {
    id: 'ad-identities-groups',
    title: 'Users, groups, and directory objects',
    outcome: 'Enumerate directory identities and explain how users, groups, distinguished names, and group membership relate to authorization.',
    evidence: 'Query the live directory for user objects and explain at least one identity attribute and one authorization relationship.',
    practiceLabel: 'Enumerate directory identities',
  },
  {
    id: 'ad-dns-discovery',
    title: 'DNS and service discovery',
    outcome: 'Explain why Active Directory depends on DNS and how clients discover LDAP/Kerberos domain services.',
    evidence: 'Resolve the domain controller and inspect an AD service record from the live domain, then explain what the record tells a domain client.',
    practiceLabel: 'Inspect AD DNS records',
  },
  {
    id: 'ad-group-policy',
    title: 'Group Policy architecture',
    outcome: 'Explain how Group Policy objects are represented in Active Directory and how policy scope connects directory metadata with SYSVOL content.',
    evidence: 'Enumerate live groupPolicyContainer objects and identify the directory-side name/path metadata used to locate policy content.',
    practiceLabel: 'Enumerate Group Policy objects',
  },
  {
    id: 'ad-kerberos-auth',
    title: 'Kerberos authentication',
    outcome: 'Explain the client, KDC, ticket-granting ticket, service ticket, SPN, and time/DNS dependencies involved in domain authentication.',
    evidence: 'Obtain a Kerberos TGT for the provided low-privilege lab identity and inspect the resulting ticket cache.',
    practiceLabel: 'Obtain and inspect a TGT',
  },
  {
    id: 'ad-security-boundaries',
    title: 'Security boundaries and exposure',
    outcome: 'Assess directory and host exposure without treating successful authentication as administrative privilege.',
    evidence: 'Use the provided domain identity to enumerate an SMB endpoint and explain the difference between authentication, share access, and administrative control.',
    practiceLabel: 'Inspect authenticated SMB exposure',
  },
  {
    id: 'ad-advanced-operations',
    title: 'Advanced domain operations',
    outcome: 'Connect service identities, SPNs, delegated trust, lateral movement, and evidence collection into a defensible domain-security workflow.',
    evidence: 'Enumerate service principal names in the disposable domain and explain why service-account configuration can create a credential-risk path without claiming compromise from enumeration alone.',
    practiceLabel: 'Inspect service principal exposure',
  },
];

export const ACTIVE_DIRECTORY_PATH = {
  id: ACTIVE_DIRECTORY_PATH_ID,
  version: ACTIVE_DIRECTORY_PATH_VERSION,
  title: 'Active Directory Operations',
  description: 'Progress from domain fundamentals through identities, DNS, Group Policy, Kerberos, security boundaries, and advanced operations using the real disposable Black Domain environment.',
  capabilityCount: ACTIVE_DIRECTORY_CAPABILITIES.length,
  capabilities: ACTIVE_DIRECTORY_CAPABILITIES,
} as const;

export function buildActiveDirectoryAcademyCourse(): AcademyCourse {
  return {
    title: ACTIVE_DIRECTORY_PATH.title,
    topic: 'Active Directory administration and security operations',
    level: 'intermediate',
    overview: 'Learn Active Directory as a system rather than a bag of attack commands. Each stage uses the live Black Domain environment to connect directory structure, DNS, policy, authentication, and security exposure to evidence you can inspect and explain.',
    estimatedMinutes: 360,
    objectives: ACTIVE_DIRECTORY_CAPABILITIES.map((capability) => capability.outcome),
    prerequisites: [
      'Basic TCP/IP, DNS, Linux shell, and Windows concepts.',
      'Start Operation Black Domain and keep its Ubuntu operator node running for the practical checkpoints.',
      'Use only the disposable OXSIG Operation scope and its issued starting identity.',
    ],
    lessons: [
      {
        id: 'ad-foundations',
        title: 'Domain foundations and scope',
        summary: 'Establish the domain, systems, roles, and identity boundary before touching directory protocols.',
        explanation: 'Active Directory Domain Services centralizes identity and directory-backed policy for a Windows domain. A domain controller hosts AD DS and DNS services; member workstations consume those services. The Black Domain operator is deliberately outside the Windows user experience but inside the isolated Operation network, giving you a controlled place to observe the domain. Start every investigation by defining scope and identity: knowing an IP address is not the same as knowing a host role, and possessing a domain credential is not the same as having administrative authority.',
        keyPoints: [
          'The domain is a logical identity and policy boundary backed by directory services.',
          'A domain controller provides directory/authentication services; a workstation consumes them.',
          'DNS names and directory identities are different namespaces with deliberate relationships.',
          'OXSIG issues per-run scope and credentials; do not reuse assumptions from another run.',
        ],
        visual: { title: 'Black Domain trust boundary', nodes: ['Ubuntu operator', 'blackdomain.local', 'Domain Controller', 'Windows workstation', 'domain identities'] },
        practice: {
          title: 'Inspect the issued Operation scope',
          instruction: 'Predict the domain, starting identity, and two Windows systems, then read the server-issued Operation scope. Explain which values are identities, names, and network addresses.',
          command: "test -r /opt/oxsig/operation.env && sed -n '1,8p' /opt/oxsig/operation.env && printf '%s\\n' '--- hosts ---' && getent hosts dc.blackdomain.local ws01.blackdomain.local",
          expected: 'The output identifies blackdomain.local, the domain controller, workstation, and the issued low-privilege identity. Explain the difference between host addressing and domain identity.',
          labRequired: true,
        },
        checkpoint: 'Describe the Black Domain trust boundary and the role of each system without equating network reachability with privilege.',
      },
      {
        id: 'ad-identities-groups',
        title: 'Users, groups, and directory objects',
        summary: 'Read real LDAP objects and connect directory attributes to authentication and authorization.',
        explanation: 'AD stores users, groups, computers, policies, and other objects in a hierarchical directory. LDAP exposes those objects using distinguished names and attributes. A user account identifies a security principal; group memberships can grant rights through ACLs, local-group membership, or policy. Enumeration is therefore about building an accurate identity graph, not simply collecting usernames. In a security review, always distinguish the existence of an account from what that account is authorized to do.',
        keyPoints: [
          'LDAP represents directory objects with distinguished names and attributes.',
          'sAMAccountName and userPrincipalName are identifiers with different formats and uses.',
          'Groups aggregate security principals and influence authorization.',
          'Enumeration proves visibility of metadata, not control of the enumerated account.',
        ],
        visual: { title: 'Directory identity graph', nodes: ['domain', 'organizational containers', 'users', 'groups', 'authorization relationships'] },
        practice: {
          title: 'Enumerate user objects over LDAP',
          instruction: 'Predict which lab identities should exist, then bind to the live directory with the issued low-privilege domain identity and enumerate user-object metadata. Explain the attributes you receive and why successful directory authentication does not imply administrative privilege.',
          command: "source /opt/oxsig/operation.env; ldapsearch -LLL -x -H ldap://dc.blackdomain.local -D 'labuser@blackdomain.local' -w \"$INITIAL_PASSWORD\" -b 'DC=blackdomain,DC=local' '(objectClass=user)' sAMAccountName userPrincipalName memberOf 2>/dev/null | sed -n '1,80p'",
          expected: 'The issued low-privilege identity authenticates to LDAP and the directory returns user-object metadata it is authorized to read. Identify sAMAccountName/userPrincipalName and any membership data; authenticated enumeration alone must not be described as compromise or administrator access.',
          labRequired: true,
        },
        checkpoint: 'Explain how a directory user, a group, and a membership relationship differ from one another.',
      },
      {
        id: 'ad-dns-discovery',
        title: 'DNS and service discovery',
        summary: 'See why a healthy domain is inseparable from correct DNS service discovery.',
        explanation: 'AD clients use DNS not only to resolve hostnames but also to locate domain services. SRV records advertise service, protocol, port, and target information for LDAP and Kerberos. A machine can have basic IP connectivity while domain operations still fail because DNS points at the wrong resolver or required records are missing. This is why AD troubleshooting should verify DNS before blaming credentials or Kerberos.',
        keyPoints: [
          'AD publishes service-location information through DNS SRV records.',
          'The domain controller commonly hosts DNS for a small disposable domain.',
          'Kerberos and LDAP rely on correct naming as well as network reachability.',
          'A successful A/AAAA lookup does not by itself prove AD service discovery works.',
        ],
        visual: { title: 'AD discovery', nodes: ['client query', 'DNS resolver', '_ldap._tcp SRV', 'domain controller target', 'LDAP/Kerberos connection'] },
        practice: {
          title: 'Inspect AD DNS service records',
          instruction: 'Predict the LDAP service target and port, then query the Black Domain DNS server directly for its domain-controller LDAP SRV record and resolve the DC hostname.',
          command: "source /opt/oxsig/operation.env; dig @\"$DOMAIN_CONTROLLER\" dc.blackdomain.local A +short; dig @\"$DOMAIN_CONTROLLER\" _ldap._tcp.dc._msdcs.blackdomain.local SRV +short",
          expected: 'The DC address resolves and an LDAP SRV record identifies a domain-controller target on the LDAP service port. Explain how a client uses this information.',
          labRequired: true,
        },
        checkpoint: 'Explain why changing a domain member to an unrelated DNS resolver can break authentication even when internet access still works.',
      },
      {
        id: 'ad-group-policy',
        title: 'Group Policy architecture',
        summary: 'Connect GPO directory metadata with the policy content domain members consume.',
        explanation: 'A Group Policy Object has directory-side metadata in AD and policy content associated with SYSVOL. Domain, site, and organizational-unit links determine scope; security filtering and other mechanisms further influence application. Administrators and defenders need to reason about both where a GPO exists and where it applies. Simply discovering a GPO does not prove it reaches every computer.',
        keyPoints: [
          'GPO metadata is represented by groupPolicyContainer objects in the directory.',
          'Policy files are associated with SYSVOL paths referenced by GPO metadata.',
          'Links and scope determine where policy is intended to apply.',
          'Discovery of policy metadata is different from proving effective policy on a host.',
        ],
        visual: { title: 'Group Policy path', nodes: ['GPO object in AD', 'GPO link/scope', 'SYSVOL policy content', 'domain member refresh', 'effective policy'] },
        practice: {
          title: 'Enumerate live GPO metadata',
          instruction: 'Predict whether a newly created Windows domain has policy objects, then use the issued low-privilege domain identity to enumerate Group Policy container metadata from LDAP. Identify the display name and file-system path when present.',
          command: "source /opt/oxsig/operation.env; ldapsearch -LLL -x -H ldap://dc.blackdomain.local -D 'labuser@blackdomain.local' -w \"$INITIAL_PASSWORD\" -b 'CN=Policies,CN=System,DC=blackdomain,DC=local' '(objectClass=groupPolicyContainer)' displayName name gPCFileSysPath 2>/dev/null | sed -n '1,100p'",
          expected: 'The authenticated low-privilege directory query returns one or more GPO container objects, typically including default domain policies. Explain the relationship between the directory object and referenced policy content without claiming the policy is effective everywhere.',
          labRequired: true,
        },
        checkpoint: 'Explain why finding a GPO in LDAP is not enough to claim that the policy is effective on a particular workstation.',
      },
      {
        id: 'ad-kerberos-auth',
        title: 'Kerberos authentication',
        summary: 'Obtain a real ticket and separate identity proof from service authorization.',
        explanation: 'Kerberos lets a client authenticate to a Key Distribution Center and receive tickets that can be presented to services. The initial ticket-granting ticket is not a universal admin token; it represents an authenticated principal and enables later service-ticket requests. Correct realm configuration, DNS, time, and SPNs matter. In Black Domain the issued labuser credential is intentionally low privilege, which makes it useful for seeing that successful domain authentication and administrative authorization are separate questions.',
        keyPoints: [
          'The KDC issues a TGT after successful initial authentication.',
          'A TGT is used to request service tickets; it is not proof of administrator rights.',
          'SPNs identify service instances for Kerberos ticketing.',
          'DNS, realm configuration, and clock alignment are operational dependencies.',
        ],
        visual: { title: 'Kerberos flow', nodes: ['client principal', 'KDC/AS', 'TGT', 'KDC/TGS', 'service ticket', 'service'] },
        practice: {
          title: 'Obtain and inspect a TGT',
          instruction: 'Predict what principal will appear in the ticket cache, then authenticate with the per-run lab identity and inspect the cache. Do not expose the password in your explanation.',
          command: "source /opt/oxsig/operation.env; printf '%s\\n' \"$INITIAL_PASSWORD\" | kinit 'labuser@BLACKDOMAIN.LOCAL' && klist",
          expected: 'kinit succeeds in the live domain and klist shows a ticket cache for labuser with a krbtgt/BLACKDOMAIN.LOCAL ticket. Explain what this proves and what it does not prove.',
          labRequired: true,
        },
        checkpoint: 'Explain the difference between a TGT, a service ticket, and authorization to perform an administrative action.',
      },
      {
        id: 'ad-security-boundaries',
        title: 'Security boundaries and exposure',
        summary: 'Use authenticated enumeration to reason carefully about what a domain identity can actually reach.',
        explanation: 'Security assessments become misleading when authentication, authorization, and administrative control are collapsed into one idea. A valid domain account may authenticate to a service but see only limited resources. SMB is a good example: a server can accept domain authentication while individual shares and administrative functions remain separately authorized. Evidence should state exactly what happened—authenticated, listed shares, read a file, changed a setting—not jump directly to “compromised.”',
        keyPoints: [
          'Authentication answers who the principal is; authorization answers what it may do.',
          'Network service exposure and share permissions are separate controls.',
          'Administrative shares or privileged operations require stronger authorization.',
          'Precise evidence language is part of professional security work.',
        ],
        visual: { title: 'Access decision', nodes: ['reachable service', 'authenticate identity', 'authorization check', 'allowed resource/action', 'evidence-backed conclusion'] },
        practice: {
          title: 'Inspect authenticated SMB exposure',
          instruction: 'Predict whether the low-privilege domain user can authenticate to the workstation and what share metadata may be visible. List shares with the issued credential and describe only what the output proves.',
          command: "source /opt/oxsig/operation.env; smbclient -L //ws01.blackdomain.local -U \"BLACKDOMAIN\\\\labuser%$INITIAL_PASSWORD\" -m SMB3 2>/dev/null | sed -n '1,80p'",
          expected: 'The workstation responds to authenticated SMB enumeration and returns the share information allowed to the issued identity. Your explanation must separate successful authentication from administrative control.',
          labRequired: true,
        },
        checkpoint: 'Give one example of a conclusion that is justified by authenticated SMB enumeration and one stronger conclusion that would require additional evidence.',
      },
      {
        id: 'ad-advanced-operations',
        title: 'Advanced domain operations',
        summary: 'Connect service identities and SPNs to realistic attack-path and defensive reasoning inside the disposable domain.',
        explanation: 'Service accounts often sit at the intersection of directory identity and host privilege. An SPN binds a Kerberos service identity to an account so clients can request tickets for that service. Security assessment therefore examines where SPNs exist, how service accounts are privileged, and whether credential policy creates unnecessary risk. Enumeration is the first step; a defensible finding also needs evidence of the account configuration, reachable service, privilege consequence, or other impact. Black Domain deliberately includes a service identity so you can reason through that chain safely.',
        keyPoints: [
          'SPNs connect Kerberos service names to security principals.',
          'Service identities should have narrowly scoped rights and strong credential management.',
          'An exposed or weak service account becomes serious when its privileges create a useful path.',
          'A complete finding distinguishes discovery, exploitation evidence, privilege consequence, and remediation.',
        ],
        visual: { title: 'Service identity risk chain', nodes: ['SPN discovery', 'service principal', 'credential exposure', 'host/domain authorization', 'impact evidence'] },
        practice: {
          title: 'Enumerate service principal exposure',
          instruction: 'Use the issued low-privilege identity to enumerate accounts with SPNs in the disposable domain. Identify the intentionally configured service identity and explain why SPN presence is a lead rather than proof of compromise.',
          command: "source /opt/oxsig/operation.env; impacket-GetUserSPNs \"BLACKDOMAIN.LOCAL/labuser:$INITIAL_PASSWORD\" -dc-ip \"$DOMAIN_CONTROLLER\" 2>/dev/null | sed -n '1,100p'",
          expected: 'The output identifies one or more service principal registrations, including the lab service identity when the domain is ready. Explain the risk chain without claiming that enumeration alone recovered a credential.',
          labRequired: true,
        },
        checkpoint: 'Build an evidence chain from SPN discovery to a defensible service-account risk finding, naming what additional proof would be required at each stronger claim.',
      },
    ],
  };
}
