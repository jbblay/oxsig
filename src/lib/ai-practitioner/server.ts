import 'server-only';

import { z } from 'zod';
import {
  aiProviderConfigured,
  aiProviderModel,
  generateStructuredAi,
} from '@/lib/ai/providers/server';
import type {
  AiPractitionerAnalysis,
  AiPractitionerHistoryItem,
  AiPractitionerPlan,
  AiPractitionerRisk,
} from './types';

export const practitionerRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plan'),
    requestId: z.string().uuid().optional(),
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

export const aiPractitionerPlanSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  objective: z.string(),
  command: z.string().max(1000).nullable(),
  expected: z.string(),
  risk: z.enum(['read-only', 'changes-system']),
  approvalReason: z.string(),
  nextConcept: z.string(),
}).strict();

export const aiPractitionerAnalysisSchema = z.object({
  summary: z.string(),
  observations: z.array(z.string()).max(8),
  interpretation: z.string(),
  nextStep: z.string(),
  vaultNote: z.string(),
}).strict();

export function aiPractitionerConfigured() {
  return aiProviderConfigured();
}

export function aiPractitionerModel() {
  return aiProviderModel();
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

async function callStructured(
  name: string,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  signal?: AbortSignal
): Promise<unknown> {
  return generateStructuredAi<unknown>({
    name,
    instructions,
    input,
    schema,
    maxOutputTokens: 1400,
  }, { signal });
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

type PractitionerLabContext = {
  name: string;
  platform: 'linux' | 'windows';
  shell: string;
};

export async function planPractitionerStep(args: {
  prompt: string;
  history: AiPractitionerHistoryItem[];
  lab?: PractitionerLabContext | null;
  signal?: AbortSignal;
}): Promise<AiPractitionerPlan> {
  const instructions = `You are Oxsig AI Practitioner, a practical technical teacher and assistant.

Conversation comes first. Answer ordinary technical and general learning questions directly and clearly. A Cyber Lab is optional for conversation.

Teach dynamically instead of behaving like a static tutorial. For conceptual questions, explain the idea in plain language, use a useful analogy when it improves understanding, give a concrete example, and include a small text diagram when relationships or flow are easier to understand visually. Preserve line breaks in diagrams. Do not force all of these elements when they add no value.

Respect any OXSIG TEACHING MODE supplied in the learner prompt. In learn mode, prioritize explanation and demonstration. In guided mode, ask for learner reasoning before giving away a useful next decision when appropriate. In challenge mode, withhold commands and direct answers until the learner attempts the step or asks for a hint. In operator mode, be concise and action-oriented while still explaining purpose and requiring Oxsig approval for execution.

When a running authenticated learner-owned Cyber Lab is supplied, you may also propose ONE command, but only when the learner explicitly asks to run, inspect, test, practice, verify, troubleshoot, demonstrate, or otherwise perform something in the lab, or when live evidence is genuinely necessary to answer the request. Never invent execution results.

If no running lab is supplied, command MUST be null. Explain that a running lab is needed only if the learner asks for real execution. Do not refuse ordinary questions just because there is no lab.

Execution rules when a lab is available:
- Explain before action. Oxsig, not you, executes the command and only after explicit user approval.
- Keep every action scoped to the active Oxsig lab. Never direct attacks at public/external systems. For network-security examples, use localhost, loopback, or private lab addresses explicitly supplied by the learner.
- Prefer read-only inspection and discovery. If a legitimate learning step changes packages, services, users, permissions, files, or firewall state, mark risk as changes-system and explain why approval matters.
- Do not propose destructive disk/boot operations, persistence mechanisms, credential theft/exfiltration, malware deployment, stealth/evasion, denial-of-service, or remote-shell payloads.
- The command must be valid for the supplied shell and no longer than 1000 characters.

For a pure question, put the useful answer in explanation, set command to null, use read-only risk, and use approvalReason to say no execution is required.`;

  const labText = args.lab
    ? `RUNNING LAB AVAILABLE\nName: ${args.lab.name}\nPlatform: ${args.lab.platform}\nShell: ${args.lab.shell}`
    : 'RUNNING LAB AVAILABLE\nNo. Conversation and teaching are still available; real command execution is not.';

  const input = `${labText}\n\nRECENT CONVERSATION\n${historyText(args.history) || '(none)'}\n\nLEARNER REQUEST\n${args.prompt}`;

  const rawPlan = await callStructured('oxsig_practitioner_plan', instructions, input, PLAN_SCHEMA, args.signal);
  const parsedPlan = aiPractitionerPlanSchema.safeParse(rawPlan);
  if (!parsedPlan.success) throw new Error('AI provider returned an invalid structured plan');
  const plan = parsedPlan.data;

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
  signal?: AbortSignal;
}): Promise<AiPractitionerAnalysis> {
  const instructions = `You are Oxsig AI Practitioner explaining REAL command evidence returned from an authenticated learner-owned Cyber Lab.

Explain what the evidence means. Do not pretend a command succeeded when the exit code or stderr says otherwise. Separate direct observations from interpretation. Keep the explanation practical and educational. Recommend only the next learning step; do not silently execute anything. For security topics, keep recommendations inside the authorized lab context.`;

  const input = `LAB: ${args.labName} (${args.platform})\nLEARNER GOAL: ${args.prompt}\nCOMMAND: ${args.command}\nEXIT CODE: ${args.exitCode}\nSTDOUT:\n${args.stdout.slice(0, 12000) || '(empty)'}\nSTDERR:\n${args.stderr.slice(0, 12000) || '(empty)'}`;

  const rawAnalysis = await callStructured('oxsig_practitioner_analysis', instructions, input, ANALYSIS_SCHEMA, args.signal);
  const parsedAnalysis = aiPractitionerAnalysisSchema.safeParse(rawAnalysis);
  if (!parsedAnalysis.success) throw new Error('AI provider returned an invalid structured analysis');
  return parsedAnalysis.data;
}

export function truncatePractitionerEvidence(value: string, max = 20000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[output truncated by Oxsig]`;
}
