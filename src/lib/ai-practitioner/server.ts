import 'server-only';

import { z } from 'zod';
import type {
  AiPractitionerAnalysis,
  AiPractitionerHistoryItem,
  AiPractitionerPlan,
  AiPractitionerRisk,
} from './types';

export const practitionerRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plan'),
    labInstanceId: z.string().uuid().optional().nullable(),
    prompt: z.string().trim().min(1).max(4000),
    history: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(4000),
    })).max(10).default([]),
  }).strict(),
  z.object({
    action: z.literal('explain'),
    labInstanceId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(4000),
    command: z.string().trim().min(1).max(1000),
    stdout: z.string().max(20000).default(''),
    stderr: z.string().max(20000).default(''),
    exitCode: z.number().int().min(-1).max(255),
  }).strict(),
]);

export const practitionerExecuteSchema = z.object({
  command: z.string().trim().min(1).max(1000),
  approved: z.literal(true),
}).strict();

export function aiPractitionerConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function aiPractitionerModel() {
  return process.env.OXSIG_AI_MODEL?.trim() || 'gpt-5.4-mini';
}

const destructivePatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\s)rm\s+[^\n]*(?:-rf|-fr)[^\n]*(?:\/(?:\s|$)|\/\*|--no-preserve-root)/i, reason: 'destructive filesystem removal is blocked' },
  { pattern: /(^|\s)(?:mkfs(?:\.[a-z0-9]+)?|wipefs)\b/i, reason: 'filesystem destruction is blocked' },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\//i, reason: 'raw block-device writes are blocked' },
  { pattern: /(^|\s)(?:shutdown|reboot|poweroff|halt)\b/i, reason: 'AI Practitioner cannot change the VM lifecycle' },
  { pattern: /:\(\)\s*\{[^}]*:\|:&[^}]*\}\s*;\s*:/, reason: 'resource-exhaustion commands are blocked' },
  { pattern: /(^|\s)(?:nc|ncat|netcat|socat)\b[^\n]*(?:\s-e\s|EXEC:)/i, reason: 'interactive remote-shell payloads are blocked' },
  { pattern: /\/dev\/(?:tcp|udp)\//i, reason: 'shell network redirection payloads are blocked' },
  { pattern: /\b(?:bash|sh|zsh|ksh)\s+-i\b[^\n]*(?:\||>|<)[^\n]*\b(?:nc|ncat|netcat|socat)\b/i, reason: 'interactive remote-shell pipelines are blocked' },
  { pattern: /\b(?:python(?:3)?|perl|ruby|php)\b[^\n]*(?:socket\.socket|TCPSocket|fsockopen)[^\n]*(?:dup2|subprocess|system|exec|spawn|shell_exec)/i, reason: 'scripted remote-shell payloads are blocked' },
];

const mutatingPattern = /(?:^|\s)(?:apt(?:-get)?|dnf|yum|rpm|dpkg|pip|pip3|npm|pnpm|systemctl|service|useradd|userdel|usermod|groupadd|groupdel|chmod|chown|setfacl|firewall-cmd|ufw|iptables|nft|mount|umount|mkdir|touch|cp|mv|tee|sed\s+-i)\b|(?:^|\s)(?:echo|printf)\b[^\n]*>/i;

export function classifyPractitionerCommand(command: string): AiPractitionerRisk {
  return mutatingPattern.test(command) ? 'changes-system' : 'read-only';
}

export function validatePractitionerCommand(command: string): { ok: true; risk: AiPractitionerRisk } | { ok: false; error: string } {
  const value = command.trim();
  if (!value || value.length > 1000 || value.includes('\0')) {
    return { ok: false, error: 'Command must contain 1 to 1000 safe text characters' };
  }
  for (const rule of destructivePatterns) {
    if (rule.pattern.test(value)) return { ok: false, error: rule.reason };
  }
  return { ok: true, risk: classifyPractitionerCommand(value) };
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

async function callStructured<T>(
  name: string,
  instructions: string,
  input: string,
  schema: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI Practitioner is not configured. Set OPENAI_API_KEY on the Oxsig server.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiPractitionerModel(),
      store: false,
      instructions,
      input,
      max_output_tokens: 1400,
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `AI provider request failed (${response.status})`;
    throw new Error(String(message).slice(0, 500));
  }

  const text = extractResponseText(payload);
  if (!text) throw new Error('AI provider returned no usable response');
  return JSON.parse(text) as T;
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    explanation: { type: 'string' },
    objective: { type: 'string' },
    command: { type: ['string', 'null'] },
    expected: { type: 'string' },
    risk: { type: 'string', enum: ['read-only', 'changes-system'] },
    approvalReason: { type: 'string' },
    nextConcept: { type: 'string' },
  },
  required: ['title', 'explanation', 'objective', 'command', 'expected', 'risk', 'approvalReason', 'nextConcept'],
  additionalProperties: false,
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    interpretation: { type: 'string' },
    nextStep: { type: 'string' },
    vaultNote: { type: 'string' },
  },
  required: ['summary', 'observations', 'interpretation', 'nextStep', 'vaultNote'],
  additionalProperties: false,
};

function historyText(history: AiPractitionerHistoryItem[]) {
  return history.slice(-8).map((item) => `${item.role.toUpperCase()}: ${item.content}`).join('\n');
}

export type PractitionerOperationContext = {
  codename: string;
  mode: 'practice' | 'walkthrough' | 'challenge';
  summary: string;
  objectives: string[];
  topology: string[];
  nodeLabel: string;
  nodeRole: string;
  nodes: Array<{
    label: string;
    role: string;
    osFamily: string;
    privateIp?: string | null;
  }>;
};

export type PractitionerLabContext = {
  name: string;
  platform: 'linux' | 'windows';
  shell: string;
  operation?: PractitionerOperationContext;
};

function operationTeachingRules(operation?: PractitionerOperationContext) {
  if (!operation) return '';
  const modeRule = operation.mode === 'walkthrough'
    ? 'WALKTHROUGH: teach explicitly and demonstrate small steps when the learner needs them, but still ask them to interpret important evidence.'
    : operation.mode === 'challenge'
      ? 'CHALLENGE: preserve productive struggle. Prefer a focused diagnostic question or a small hint before revealing a command. Let the learner lead whenever they show a viable idea.'
      : 'PRACTICE: use guided discovery. Ask for the learner\'s reasoning when useful, give progressively stronger hints, and demonstrate only when a gap blocks progress.';

  return `\nThis is an Operation learning session, not a static tutorial. The learner already chose what they want to practice. Teach only the next useful gap revealed by their request, reasoning, or real evidence. Do not dump a full walkthrough. Use one teaching move at a time: question, hint, concise explanation, or one proposed command.\n${modeRule}\nWhen the learner gives a reasonable next step, acknowledge the useful part and let them perform it. When they are mistaken, correct the specific misconception and then ask them to try again or propose the smallest useful action. Commands must apply only to the SELECTED OPERATION MACHINE. Never silently switch machines.\n`;
}

export async function planPractitionerStep(args: {
  prompt: string;
  history: AiPractitionerHistoryItem[];
  lab?: PractitionerLabContext | null;
}): Promise<AiPractitionerPlan> {
  const instructions = `You are Oxsig AI Practitioner, a practical technical teacher and assistant.

Conversation comes first. Answer ordinary technical and general learning questions directly and clearly. A Cyber Lab or Operation machine is optional for conversation.

When a running authenticated learner-owned machine is supplied, you may propose ONE command, but only when the learner explicitly asks to run, inspect, test, practice, verify, troubleshoot, or otherwise perform something in the lab, or when live evidence is genuinely necessary to advance the exercise. Never invent execution results.

If no running machine is supplied, command MUST be null. Explain that a running machine is needed only if the learner asks for real execution. Do not refuse ordinary questions just because there is no machine.
${operationTeachingRules(args.lab?.operation)}
Execution rules when a machine is available:
- Explain before action. Oxsig, not you, executes the command and only after explicit user approval.
- Keep every action scoped to the active Oxsig lab/Operation. Never direct attacks at public/external systems. For network-security examples, use localhost, loopback, or the private Operation addresses supplied in context.
- Prefer read-only inspection and discovery. If a legitimate learning step changes packages, services, users, permissions, files, or firewall state, mark risk as changes-system and explain why approval matters.
- Do not propose destructive disk/boot operations, persistence mechanisms, credential theft/exfiltration, malware deployment, stealth/evasion, denial-of-service, or remote-shell payloads.
- The command must be valid for the supplied shell and no longer than 1000 characters.
- A question or hint is often better teaching than a command. If the learner can reasonably make the next inference, set command to null and ask them to reason or choose the next action.

For a pure question, put the useful answer in explanation, set command to null, use read-only risk, and use approvalReason to say no execution is required.`;

  const operationText = args.lab?.operation
    ? `\nOPERATION\nCodename: ${args.lab.operation.codename}\nMode: ${args.lab.operation.mode}\nSummary: ${args.lab.operation.summary}\nObjectives: ${args.lab.operation.objectives.join(' | ')}\nTopology: ${args.lab.operation.topology.join(' -> ')}\nSelected machine: ${args.lab.operation.nodeLabel} (${args.lab.operation.nodeRole})\nMachines:\n${args.lab.operation.nodes.map((node) => `- ${node.label} | role=${node.role} | os=${node.osFamily}${node.privateIp ? ` | private_ip=${node.privateIp}` : ''}`).join('\n')}`
    : '';

  const labText = args.lab
    ? `RUNNING MACHINE AVAILABLE\nName: ${args.lab.name}\nPlatform: ${args.lab.platform}\nShell: ${args.lab.shell}${operationText}`
    : 'RUNNING MACHINE AVAILABLE\nNo. Conversation and teaching are still available; real command execution is not.';

  const input = `${labText}\n\nRECENT CONVERSATION\n${historyText(args.history) || '(none)'}\n\nLEARNER REQUEST\n${args.prompt}`;

  const plan = await callStructured<AiPractitionerPlan>('oxsig_practitioner_plan', instructions, input, PLAN_SCHEMA);
  if (!args.lab) {
    plan.command = null;
    plan.risk = 'read-only';
    return plan;
  }
  if (plan.command) {
    const validated = validatePractitionerCommand(plan.command);
    if (!validated.ok) {
      return {
        ...plan,
        command: null,
        risk: 'read-only',
        approvalReason: `Oxsig blocked the proposed command because ${validated.error}. Ask for a safer equivalent.`,
      };
    }
    plan.risk = validated.risk === 'changes-system' ? 'changes-system' : plan.risk;
  }
  return plan;
}

export async function explainPractitionerEvidence(args: {
  prompt: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  labName: string;
  platform: 'linux' | 'windows';
}): Promise<AiPractitionerAnalysis> {
  const instructions = `You are Oxsig AI Practitioner explaining REAL command evidence returned from an authenticated learner-owned lab or Operation machine.

Explain what the evidence means. Do not pretend a command succeeded when the exit code or stderr says otherwise. Separate direct observations from interpretation. Keep the explanation practical and educational. Do not immediately solve the rest of the exercise. Recommend one next learning step or one focused question that makes the learner interpret the evidence. For security topics, keep recommendations inside the authorized lab context.`;

  const input = `LAB: ${args.labName} (${args.platform})\nLEARNER GOAL: ${args.prompt}\nCOMMAND: ${args.command}\nEXIT CODE: ${args.exitCode}\nSTDOUT:\n${args.stdout.slice(0, 12000) || '(empty)'}\nSTDERR:\n${args.stderr.slice(0, 12000) || '(empty)'}`;

  return callStructured<AiPractitionerAnalysis>('oxsig_practitioner_analysis', instructions, input, ANALYSIS_SCHEMA);
}

export function truncatePractitionerEvidence(value: string, max = 20000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[output truncated by Oxsig]`;
}
