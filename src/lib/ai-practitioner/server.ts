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
    labInstanceId: z.string().uuid(),
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
  { pattern: /(^|\s)rm\s+[^\n]*(?:-rf|-fr)[^\n]*(?:\/\s|\/\*|--no-preserve-root)/i, reason: 'destructive filesystem removal is blocked' },
  { pattern: /(^|\s)(?:mkfs(?:\.[a-z0-9]+)?|wipefs)\b/i, reason: 'filesystem destruction is blocked' },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\//i, reason: 'raw block-device writes are blocked' },
  { pattern: /(^|\s)(?:shutdown|reboot|poweroff|halt)\b/i, reason: 'AI Practitioner cannot change the VM lifecycle' },
  { pattern: /:\(\)\s*\{[^}]*:\|:&[^}]*\}\s*;\s*:/, reason: 'resource-exhaustion commands are blocked' },
  { pattern: /(^|\s)(?:nc|ncat|netcat|socat)\b[^\n]*(?:\s-e\s|EXEC:)/i, reason: 'interactive remote-shell payloads are blocked' },
];

const mutatingPattern = /(^|\s)(?:apt(?:-get)?|dnf|yum|rpm|dpkg|pip|pip3|npm|pnpm|systemctl|service|useradd|userdel|usermod|groupadd|groupdel|chmod|chown|setfacl|firewall-cmd|ufw|iptables|nft|mount|umount|mkdir|touch|cp|mv|tee|sed\s+-i|echo\b[^\n]*>|printf\b[^\n]*>)\b/i;

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

export async function planPractitionerStep(args: {
  prompt: string;
  history: AiPractitionerHistoryItem[];
  labName: string;
  platform: 'linux' | 'windows';
  shell: string;
}): Promise<AiPractitionerPlan> {
  const instructions = `You are Oxsig AI Practitioner: a practical technical instructor working inside an authenticated, temporary Cyber Lab owned by the learner.

Your job is to EXPLAIN BEFORE ACTION and propose at most one next command. The Oxsig application, not you, executes commands only after explicit user approval.

Rules:
- Teach Linux, Windows, networking, DevOps, cloud, forensics, defensive security, and authorized cybersecurity practice.
- Keep every action scoped to the active Oxsig lab. Never direct attacks at public/external systems. For network-security examples, use localhost, loopback, or private lab addresses explicitly supplied by the learner. If a required target/topology is missing, set command to null and explain what the learner needs first.
- Prefer read-only inspection and discovery. If a legitimate learning step changes packages, services, users, permissions, files, or firewall state, mark risk as changes-system and explain why approval matters.
- Do not propose destructive disk/boot operations, persistence mechanisms, credential theft/exfiltration, malware deployment, stealth/evasion, denial-of-service, or remote-shell payloads.
- Produce a concrete teaching explanation, not just a command dump.
- The command must be valid for the supplied shell and no longer than 1000 characters.
`;

  const input = `ACTIVE LAB
Name: ${args.labName}
Platform: ${args.platform}
Shell: ${args.shell}

RECENT LEARNING CONTEXT
${historyText(args.history) || '(none)'}

LEARNER REQUEST
${args.prompt}`;

  const plan = await callStructured<AiPractitionerPlan>('oxsig_practitioner_plan', instructions, input, PLAN_SCHEMA);
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
  const instructions = `You are Oxsig AI Practitioner explaining REAL command evidence returned from an authenticated learner-owned Cyber Lab.

Explain what the evidence means. Do not pretend a command succeeded when the exit code or stderr says otherwise. Separate direct observations from interpretation. Keep the explanation practical and educational. Recommend only the next learning step; do not silently execute anything. For security topics, keep recommendations inside the authorized lab context.`;

  const input = `LAB: ${args.labName} (${args.platform})
LEARNER GOAL: ${args.prompt}
COMMAND: ${args.command}
EXIT CODE: ${args.exitCode}
STDOUT:\n${args.stdout.slice(0, 12000) || '(empty)'}
STDERR:\n${args.stderr.slice(0, 12000) || '(empty)'}`;

  return callStructured<AiPractitionerAnalysis>('oxsig_practitioner_analysis', instructions, input, ANALYSIS_SCHEMA);
}

export function truncatePractitionerEvidence(value: string, max = 20000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[output truncated by Oxsig]`;
}
