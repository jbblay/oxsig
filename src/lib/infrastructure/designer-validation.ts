import type { InfrastructureDesign } from './designer-schema';

export type InfrastructureValidationSeverity = 'error' | 'warning';

export type InfrastructureValidationIssue = {
  severity: InfrastructureValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type InfrastructureValidationResult = {
  valid: boolean;
  errors: InfrastructureValidationIssue[];
  warnings: InfrastructureValidationIssue[];
  issues: InfrastructureValidationIssue[];
};

function parseIpv4(value: string) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part, index) => !Number.isInteger(part) || part < 0 || part > 255 || String(part) !== parts[index])) return null;
  return numbers;
}

function ipv4ToUint32(value: string) {
  const parts = parseIpv4(value);
  if (!parts) return null;
  return ((((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function parseCidr(value: string) {
  const [network, prefixRaw, ...rest] = value.split('/');
  if (rest.length || prefixRaw === undefined) return null;
  const networkValue = ipv4ToUint32(network);
  const prefix = Number(prefixRaw);
  if (networkValue === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32 || String(prefix) !== prefixRaw) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: networkValue & mask, mask };
}

function isIpv4InCidr(ip: string, cidr: string) {
  const ipValue = ipv4ToUint32(ip);
  const parsedCidr = parseCidr(cidr);
  if (ipValue === null || !parsedCidr) return false;
  return (ipValue & parsedCidr.mask) === parsedCidr.network;
}

function normalized(value?: string) {
  return value?.trim().toLowerCase() || '';
}

export function validateInfrastructureDesign(design: InfrastructureDesign): InfrastructureValidationResult {
  const issues: InfrastructureValidationIssue[] = [];
  const ipOwners = new Map<string, string>();
  const hostnameOwners = new Map<string, string>();
  const connectedNodeIds = new Set<string>();
  const linkPairs = new Set<string>();

  for (const edge of design.edges) {
    if (edge.source === edge.target) {
      issues.push({ severity: 'error', code: 'self-link', message: 'A device cannot be linked to itself.', edgeId: edge.id });
    }

    const pair = [edge.source, edge.target].sort().join('::');
    if (linkPairs.has(pair)) {
      issues.push({ severity: 'warning', code: 'duplicate-link', message: 'These two devices already have a link between them.', edgeId: edge.id });
    }
    linkPairs.add(pair);
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  for (const node of design.nodes) {
    const { hostname, ipv4, cidr, gateway } = node.data;
    const cleanHostname = normalized(hostname);
    const cleanIpv4 = ipv4?.trim() || '';
    const cleanCidr = cidr?.trim() || '';
    const cleanGateway = gateway?.trim() || '';

    if (cleanHostname) {
      if (!/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)*$/i.test(cleanHostname) || cleanHostname.split('.').some((label) => label.endsWith('-') || label.length > 63)) {
        issues.push({ severity: 'error', code: 'invalid-hostname', message: `${node.data.label} has an invalid hostname.`, nodeId: node.id });
      }
      const owner = hostnameOwners.get(cleanHostname);
      if (owner && owner !== node.id) {
        issues.push({ severity: 'warning', code: 'duplicate-hostname', message: `Hostname ${hostname} is used by more than one device.`, nodeId: node.id });
      } else {
        hostnameOwners.set(cleanHostname, node.id);
      }
    }

    if (cleanIpv4) {
      if (!parseIpv4(cleanIpv4)) {
        issues.push({ severity: 'error', code: 'invalid-ipv4', message: `${node.data.label} has an invalid IPv4 address.`, nodeId: node.id });
      } else {
        const owner = ipOwners.get(cleanIpv4);
        if (owner && owner !== node.id) {
          issues.push({ severity: 'error', code: 'duplicate-ipv4', message: `IPv4 address ${cleanIpv4} is assigned to more than one device.`, nodeId: node.id });
        } else {
          ipOwners.set(cleanIpv4, node.id);
        }
      }
    }

    if (cleanCidr && !parseCidr(cleanCidr)) {
      issues.push({ severity: 'error', code: 'invalid-cidr', message: `${node.data.label} has an invalid IPv4 CIDR. Use a value such as 10.0.0.0/24.`, nodeId: node.id });
    }

    if (cleanGateway && !parseIpv4(cleanGateway)) {
      issues.push({ severity: 'error', code: 'invalid-gateway', message: `${node.data.label} has an invalid IPv4 gateway.`, nodeId: node.id });
    }

    if (cleanIpv4 && parseIpv4(cleanIpv4) && cleanCidr && parseCidr(cleanCidr) && !isIpv4InCidr(cleanIpv4, cleanCidr)) {
      issues.push({ severity: 'error', code: 'ip-outside-cidr', message: `${node.data.label} IPv4 address is outside its configured CIDR.`, nodeId: node.id });
    }

    if (cleanGateway && parseIpv4(cleanGateway) && cleanCidr && parseCidr(cleanCidr) && !isIpv4InCidr(cleanGateway, cleanCidr)) {
      issues.push({ severity: 'warning', code: 'gateway-outside-cidr', message: `${node.data.label} gateway is outside its configured CIDR.`, nodeId: node.id });
    }

    if (design.nodes.length > 1 && !connectedNodeIds.has(node.id)) {
      issues.push({ severity: 'warning', code: 'isolated-node', message: `${node.data.label} is not connected to another device.`, nodeId: node.id });
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings, issues };
}
