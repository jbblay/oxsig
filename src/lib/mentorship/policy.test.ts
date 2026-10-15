import { describe, expect, it } from 'vitest';
import {
  INITIAL_TIERS_BY_TRACK,
  MENTOR_REAPPLY_COOLDOWN_DAYS,
  canTransitionMentorApplication,
  deriveMentorProgressionStage,
  evaluateMentorEligibility,
  ineligibleSpecializations,
  isValidTimeZone,
  mentorApplicationInputSchema,
  mentorProfileUpdateSchema,
  mentorReapplyAvailableAt,
} from './policy';

const LINUX = ['command-resolution', 'fork-copy-on-write', 'execve-elf', 'virtual-address-space', 'runtime-startup', 'process-context', 'syscalls-scheduling', 'exit-wait-zombie'];

function proved(pathId: string, ids: string[]) {
  return new Map([[pathId, new Set(ids)]]);
}

const validApplication = {
  track: 'external' as const,
  headline: 'Network engineer and coach',
  bio: 'b'.repeat(90),
  specializations: ['networking-dns'],
  yearsExperience: 8,
  motivation: 'm'.repeat(45),
  timezone: 'Europe/London',
  acceptCodeOfConduct: true as const,
};

describe('mentor eligibility', () => {
  it('is not an advanced practitioner without verified capability evidence', () => {
    const eligibility = evaluateMentorEligibility(new Map());
    expect(eligibility.advancedPractitioner).toBe(false);
    expect(eligibility.specializations.every((item) => !item.eligible)).toBe(true);
  });

  it('requires the minimum number of demonstrated capabilities in a specialization', () => {
    const almost = evaluateMentorEligibility(proved('program-becomes-process', LINUX.slice(0, 5)));
    expect(almost.specializations.find((item) => item.specializationId === 'linux-systems')).toMatchObject({ demonstrated: 5, required: 6, eligible: false });
    expect(almost.advancedPractitioner).toBe(false);

    const enough = evaluateMentorEligibility(proved('program-becomes-process', LINUX.slice(0, 6)));
    expect(enough.specializations.find((item) => item.specializationId === 'linux-systems')).toMatchObject({ demonstrated: 6, eligible: true });
    expect(enough.advancedPractitioner).toBe(true);
  });

  it('ignores capabilities proved on an unrelated path and unknown capability ids', () => {
    const eligibility = evaluateMentorEligibility(proved('active-directory-operations', [...LINUX, 'made-up']));
    expect(eligibility.specializations.find((item) => item.specializationId === 'linux-systems')?.demonstrated).toBe(0);
  });

  it('never makes specializations without an Academy pathway eligible', () => {
    const eligibility = evaluateMentorEligibility(proved('program-becomes-process', LINUX));
    const docker = eligibility.specializations.find((item) => item.specializationId === 'containers-docker');
    expect(docker).toMatchObject({ academyEvidenceAvailable: false, eligible: false });
  });

  it('restricts Academy-track claims to evidenced specializations but not external claims', () => {
    const eligibility = evaluateMentorEligibility(proved('program-becomes-process', LINUX));
    expect(ineligibleSpecializations('academy', ['linux-systems', 'containers-docker'], eligibility)).toEqual(['containers-docker']);
    expect(ineligibleSpecializations('external', ['linux-systems', 'containers-docker'], eligibility)).toEqual([]);
    expect(ineligibleSpecializations('external', ['not-a-specialization'], eligibility)).toEqual(['not-a-specialization']);
  });
});

describe('mentor progression', () => {
  const none = evaluateMentorEligibility(new Map());
  const advanced = evaluateMentorEligibility(proved('program-becomes-process', LINUX));

  it('walks Learner → Advanced Practitioner → Peer Mentor Candidate → granted tier', () => {
    expect(deriveMentorProgressionStage({ eligibility: none, hasOpenApplication: false, profile: null })).toBe('learner');
    expect(deriveMentorProgressionStage({ eligibility: advanced, hasOpenApplication: false, profile: null })).toBe('advanced_practitioner');
    expect(deriveMentorProgressionStage({ eligibility: advanced, hasOpenApplication: true, profile: null })).toBe('peer_mentor_candidate');
    expect(deriveMentorProgressionStage({ eligibility: advanced, hasOpenApplication: false, profile: { tier: 'approved_peer_mentor', status: 'active' } })).toBe('approved_peer_mentor');
  });

  it('drops a suspended or revoked mentor back to their evidence stage', () => {
    expect(deriveMentorProgressionStage({ eligibility: none, hasOpenApplication: false, profile: { tier: 'senior_mentor', status: 'suspended' } })).toBe('learner');
    expect(deriveMentorProgressionStage({ eligibility: advanced, hasOpenApplication: false, profile: { tier: 'verified_mentor', status: 'revoked' } })).toBe('advanced_practitioner');
  });

  it('only lets Academy-grown mentors start as peers', () => {
    expect(INITIAL_TIERS_BY_TRACK.academy).toEqual(['approved_peer_mentor']);
    expect(INITIAL_TIERS_BY_TRACK.external).toContain('verified_mentor');
  });
});

describe('application state machine', () => {
  it('allows only administrators to decide and only applicants to withdraw or resubmit', () => {
    expect(canTransitionMentorApplication('submitted', 'approved', 'admin')).toBe(true);
    expect(canTransitionMentorApplication('submitted', 'approved', 'applicant')).toBe(false);
    expect(canTransitionMentorApplication('under_review', 'withdrawn', 'applicant')).toBe(true);
    expect(canTransitionMentorApplication('under_review', 'withdrawn', 'admin')).toBe(false);
    expect(canTransitionMentorApplication('changes_requested', 'submitted', 'applicant')).toBe(true);
    expect(canTransitionMentorApplication('changes_requested', 'approved', 'admin')).toBe(false);
  });

  it('treats approved, rejected and withdrawn as terminal', () => {
    for (const from of ['approved', 'rejected', 'withdrawn'] as const) {
      for (const to of ['submitted', 'under_review', 'approved', 'rejected', 'withdrawn'] as const) {
        expect(canTransitionMentorApplication(from, to, 'admin')).toBe(false);
        expect(canTransitionMentorApplication(from, to, 'applicant')).toBe(false);
      }
    }
  });

  it('enforces the reapply cooldown after a rejection', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(mentorReapplyAvailableAt(null, now)).toBeNull();
    const recent = new Date(now.getTime() - 86_400_000);
    expect(mentorReapplyAvailableAt(recent, now)?.getTime()).toBe(recent.getTime() + MENTOR_REAPPLY_COOLDOWN_DAYS * 86_400_000);
    expect(mentorReapplyAvailableAt(new Date(now.getTime() - (MENTOR_REAPPLY_COOLDOWN_DAYS + 1) * 86_400_000), now)).toBeNull();
  });
});

describe('application validation', () => {
  it('accepts a complete external application', () => {
    expect(mentorApplicationInputSchema.safeParse(validApplication).success).toBe(true);
  });

  it('requires accepting the code of conduct', () => {
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, acceptCodeOfConduct: false }).success).toBe(false);
  });

  it('rejects non-https links, duplicate specializations, unknown fields and bad time zones', () => {
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, profileUrl: 'http://example.test' }).success).toBe(false);
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, specializations: ['databases', 'databases'] }).success).toBe(false);
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, tier: 'senior_mentor' }).success).toBe(false);
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, timezone: 'Mars/Olympus' }).success).toBe(false);
  });

  it('requires two years of experience for external professionals only', () => {
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, yearsExperience: 1 }).success).toBe(false);
    expect(mentorApplicationInputSchema.safeParse({ ...validApplication, track: 'academy', specializations: ['linux-systems'], yearsExperience: 0 }).success).toBe(true);
  });

  it('cannot be used to self-assign tier or qualifications through profile updates', () => {
    expect(mentorProfileUpdateSchema.safeParse({ tier: 'senior_mentor' }).success).toBe(false);
    expect(mentorProfileUpdateSchema.safeParse({ qualifications: ['databases'] }).success).toBe(false);
    expect(mentorProfileUpdateSchema.safeParse({}).success).toBe(false);
    expect(mentorProfileUpdateSchema.safeParse({ paused: true }).success).toBe(true);
  });

  it('validates IANA time zones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
