import { z } from 'zod';
import {
  MENTOR_SPECIALIZATIONS,
  MENTOR_SPECIALIZATION_IDS,
  getMentorSpecialization,
  type MentorSpecialization,
} from './specializations';

/*
 * Pure mentorship policy: eligibility, progression, the application state
 * machine and input validation. No I/O, so it is shared by routes, server
 * modules, UI and tests. XP, mastery scores and subscription status are
 * deliberately NOT inputs anywhere in this file.
 */

export const MENTOR_CODE_OF_CONDUCT_VERSION = '2026-10';
export const MENTOR_CODE_OF_CONDUCT = [
  'Guide the learner to the answer; do not complete graded or verified work for them.',
  'Only access resources the learner explicitly shares, and stop when access is revoked or the session ends.',
  'Never request, record or reuse passwords, keys, tokens or personal data.',
  'Stay inside authorized OXSIG practice environments; never direct learners at systems they do not own.',
  'Be respectful and professional. Harassment, discrimination or pressure to move off-platform is not allowed.',
  'Report safety, integrity or abuse concerns to OXSIG rather than handling them privately.',
] as const;

export const MENTOR_REAPPLY_COOLDOWN_DAYS = 14;

export type MentorTrack = 'academy' | 'external';
export type MentorTier = 'approved_peer_mentor' | 'verified_mentor' | 'senior_mentor';
export type MentorProfileStatus = 'active' | 'paused' | 'suspended' | 'revoked';
export type MentorApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export const MENTOR_TIERS: readonly MentorTier[] = ['approved_peer_mentor', 'verified_mentor', 'senior_mentor'];
export const OPEN_APPLICATION_STATUSES: readonly MentorApplicationStatus[] = ['submitted', 'under_review', 'changes_requested'];

export const MENTOR_TIER_LABELS: Record<MentorTier, string> = {
  approved_peer_mentor: 'Approved Peer Mentor',
  verified_mentor: 'Verified Mentor',
  senior_mentor: 'Senior Mentor',
};

/** Tiers an administrator may grant at first approval, per track. */
export const INITIAL_TIERS_BY_TRACK: Record<MentorTrack, readonly MentorTier[]> = {
  // Academy-grown mentors start as peers; promotion requires later evidence
  // (Mentor Forge and Proof of Help in Phase 3) plus administrator review.
  academy: ['approved_peer_mentor'],
  external: ['approved_peer_mentor', 'verified_mentor', 'senior_mentor'],
};

/* ------------------------------------------------------------ eligibility */

/** Demonstrated capability ids per curated path id. */
export type DemonstratedCapabilities = ReadonlyMap<string, ReadonlySet<string>>;

export type SpecializationEligibility = {
  specializationId: string;
  academyEvidenceAvailable: boolean;
  demonstrated: number;
  required: number;
  demonstratedCapabilityIds: string[];
  eligible: boolean;
};

export type MentorEligibility = {
  advancedPractitioner: boolean;
  specializations: SpecializationEligibility[];
};

export function evaluateSpecializationEligibility(
  specialization: MentorSpecialization,
  demonstrated: DemonstratedCapabilities
): SpecializationEligibility {
  const evidence = specialization.academyEvidence;
  if (!evidence) {
    return {
      specializationId: specialization.id,
      academyEvidenceAvailable: false,
      demonstrated: 0,
      required: 0,
      demonstratedCapabilityIds: [],
      eligible: false,
    };
  }
  const proved = demonstrated.get(evidence.pathId) ?? new Set<string>();
  const ids = evidence.capabilityIds.filter((id) => proved.has(id));
  return {
    specializationId: specialization.id,
    academyEvidenceAvailable: true,
    demonstrated: ids.length,
    required: evidence.minimumDemonstrated,
    demonstratedCapabilityIds: ids,
    eligible: ids.length >= evidence.minimumDemonstrated,
  };
}

export function evaluateMentorEligibility(demonstrated: DemonstratedCapabilities): MentorEligibility {
  const specializations = MENTOR_SPECIALIZATIONS.map((item) => evaluateSpecializationEligibility(item, demonstrated));
  return {
    advancedPractitioner: specializations.some((item) => item.eligible),
    specializations,
  };
}

/**
 * Specializations an applicant on the given track may NOT claim. Academy-track
 * applicants may only claim specializations with sufficient verified evidence;
 * external applicants are judged by human review of their professional record.
 */
export function ineligibleSpecializations(
  track: MentorTrack,
  specializationIds: readonly string[],
  eligibility: MentorEligibility
): string[] {
  return specializationIds.filter((id) => {
    if (!getMentorSpecialization(id)) return true;
    if (track === 'external') return false;
    return !eligibility.specializations.find((item) => item.specializationId === id)?.eligible;
  });
}

/* ------------------------------------------------------------ progression */

export type MentorProgressionStage =
  | 'learner'
  | 'advanced_practitioner'
  | 'peer_mentor_candidate'
  | MentorTier;

export const MENTOR_PROGRESSION: ReadonlyArray<{ stage: MentorProgressionStage; label: string; requirement: string }> = [
  { stage: 'learner', label: 'Learner', requirement: 'Complete missions and curated paths in the Academy.' },
  { stage: 'advanced_practitioner', label: 'Advanced Practitioner', requirement: 'Demonstrate enough verified capabilities in at least one specialization.' },
  { stage: 'peer_mentor_candidate', label: 'Peer Mentor Candidate', requirement: 'Submit a mentor application backed by that evidence.' },
  { stage: 'approved_peer_mentor', label: 'Approved Peer Mentor', requirement: 'Pass administrator review of competence, conduct and teaching ability.' },
  { stage: 'verified_mentor', label: 'Verified Mentor', requirement: 'Sustained, reviewed teaching quality (Mentor Forge and Proof of Help, coming next).' },
  { stage: 'senior_mentor', label: 'Senior Mentor', requirement: 'Granted by administrators for exceptional, verified mentoring.' },
];

export function deriveMentorProgressionStage(input: {
  eligibility: MentorEligibility;
  hasOpenApplication: boolean;
  profile: { tier: MentorTier; status: MentorProfileStatus } | null;
}): MentorProgressionStage {
  if (input.profile && (input.profile.status === 'active' || input.profile.status === 'paused')) {
    return input.profile.tier;
  }
  if (input.hasOpenApplication) return 'peer_mentor_candidate';
  if (input.eligibility.advancedPractitioner) return 'advanced_practitioner';
  return 'learner';
}

/* --------------------------------------------------------- state machine */

type Actor = 'applicant' | 'admin';

const TRANSITIONS: Record<MentorApplicationStatus, Partial<Record<MentorApplicationStatus, readonly Actor[]>>> = {
  submitted: { under_review: ['admin'], changes_requested: ['admin'], approved: ['admin'], rejected: ['admin'], withdrawn: ['applicant'] },
  under_review: { changes_requested: ['admin'], approved: ['admin'], rejected: ['admin'], withdrawn: ['applicant'] },
  changes_requested: { submitted: ['applicant'], rejected: ['admin'], withdrawn: ['applicant'] },
  approved: {},
  rejected: {},
  withdrawn: {},
};

export function canTransitionMentorApplication(from: MentorApplicationStatus, to: MentorApplicationStatus, actor: Actor) {
  return Boolean(TRANSITIONS[from]?.[to]?.includes(actor));
}

export function isOpenMentorApplicationStatus(status: MentorApplicationStatus) {
  return OPEN_APPLICATION_STATUSES.includes(status);
}

/** When a rejected applicant may apply again, or null if they may apply now. */
export function mentorReapplyAvailableAt(lastRejectedAt: Date | null, now = new Date()): Date | null {
  if (!lastRejectedAt) return null;
  const available = new Date(lastRejectedAt.getTime() + MENTOR_REAPPLY_COOLDOWN_DAYS * 86_400_000);
  return available > now ? available : null;
}

/* ------------------------------------------------------------ validation */

export function isValidTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((value) => value.startsWith('https://'), 'Links must use https://');

const credentialSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    issuer: z.string().trim().min(2).max(120),
    year: z.number().int().min(1970).max(2100).optional(),
    url: httpsUrl.optional(),
  })
  .strict();

export type MentorCredentialClaim = z.infer<typeof credentialSchema>;

export const mentorApplicationInputSchema = z
  .object({
    track: z.enum(['academy', 'external']),
    headline: z.string().trim().min(8).max(120),
    bio: z.string().trim().min(80, 'Tell reviewers a little more about yourself (80+ characters).').max(4000),
    specializations: z
      .array(z.enum(MENTOR_SPECIALIZATION_IDS))
      .min(1, 'Choose at least one specialization.')
      .max(6)
      .refine((items) => new Set(items).size === items.length, 'Specializations must be unique.'),
    yearsExperience: z.number().int().min(0).max(60),
    teachingBackground: z.string().trim().max(2000).default(''),
    motivation: z.string().trim().min(40, 'Explain why you want to mentor (40+ characters).').max(2000),
    credentials: z.array(credentialSchema).max(10).default([]),
    profileUrl: httpsUrl.optional(),
    timezone: z.string().refine(isValidTimeZone, 'Choose a valid IANA time zone.'),
    acceptCodeOfConduct: z.literal(true, { errorMap: () => ({ message: 'You must accept the mentor code of conduct.' }) }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.track === 'external' && value.yearsExperience < 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['yearsExperience'], message: 'External mentors need at least 2 years of professional experience.' });
    }
  });

export type MentorApplicationInput = z.infer<typeof mentorApplicationInputSchema>;

export const mentorProfileUpdateSchema = z
  .object({
    headline: z.string().trim().min(8).max(120).optional(),
    bio: z.string().trim().min(80).max(4000).optional(),
    timezone: z.string().refine(isValidTimeZone, 'Choose a valid IANA time zone.').optional(),
    availabilityNote: z.string().trim().max(500).optional(),
    isListed: z.boolean().optional(),
    paused: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export type MentorProfileUpdate = z.infer<typeof mentorProfileUpdateSchema>;
