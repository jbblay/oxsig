import type {
  MentorApplicationStatus,
  MentorCredentialClaim,
  MentorEligibility,
  MentorProfileStatus,
  MentorProgressionStage,
  MentorTier,
  MentorTrack,
} from './policy';
import type { AvailabilityRule, SessionAction, SessionKind, SessionRole, SessionStatus } from './scheduling';

/** Response contracts shared by mentorship routes and UI. */

export type MentorApplicationSummary = {
  id: string;
  track: MentorTrack;
  status: MentorApplicationStatus;
  headline: string;
  bio: string;
  specializations: string[];
  yearsExperience: number;
  teachingBackground: string;
  motivation: string;
  credentials: MentorCredentialClaim[];
  profileUrl: string | null;
  timezone: string;
  decisionNote: string | null;
  decidedAt: string | null;
  submittedAt: string;
  updatedAt: string;
};

export type MentorQualificationView = {
  id: string;
  specializationId: string;
  basis: 'academy_evidence' | 'professional_review';
  grantedAt: string;
};

export type VerifiedCredential = MentorCredentialClaim & { verifiedAt: string };

export type MentorOwnProfile = {
  track: MentorTrack;
  tier: MentorTier;
  status: MentorProfileStatus;
  statusReason: string | null;
  headline: string;
  bio: string;
  timezone: string;
  availabilityNote: string;
  isListed: boolean;
  verifiedCredentials: VerifiedCredential[];
  approvedAt: string;
  qualifications: MentorQualificationView[];
};

export type MentorCenterState = {
  stage: MentorProgressionStage;
  eligibility: MentorEligibility;
  openApplication: MentorApplicationSummary | null;
  applications: MentorApplicationSummary[];
  profile: MentorOwnProfile | null;
  canApply: boolean;
  applyBlockedReason: string | null;
  reapplyAvailableAt: string | null;
};

export type PublicMentorProfile = {
  mentorId: string;
  displayName: string;
  avatarUrl: string | null;
  track: MentorTrack;
  tier: MentorTier;
  headline: string;
  bio: string;
  timezone: string;
  availabilityNote: string;
  verifiedCredentials: VerifiedCredential[];
  qualifications: MentorQualificationView[];
  approvedAt: string;
  offerings: MentorOfferingView[];
  /** True only when the mentor is accepting bookings and has offerings plus weekly availability. */
  bookingAvailable: boolean;
  /** Reviews arrive with Proof of Help (Phase 3); never fabricated here. */
  reviewCount: 0;
};

export type MentorOfferingView = {
  id: string;
  kind: SessionKind;
  title: string;
  description: string;
  durationMinutes: number;
  specializationIds: string[];
  isActive: boolean;
};

export type MentorScheduleState = {
  timezone: string;
  offerings: MentorOfferingView[];
  rules: AvailabilityRule[];
  qualifiedSpecializationIds: string[];
};

export type MentorAvailabilityView = {
  mentorTimezone: string;
  offering: MentorOfferingView;
  slots: string[];
};

export type SharedSessionContext =
  | { type: 'academy_lesson'; courseTitle: string; lessonTitle: string; lessonSummary: string; practiceTitle: string | null; practiceInstruction: string | null; sharedAt: string }
  | Record<string, never>;

export type MentorshipSessionView = {
  id: string;
  role: SessionRole;
  status: SessionStatus;
  kind: SessionKind;
  durationMinutes: number;
  specializationId: string;
  startsAt: string;
  endsAt: string;
  learnerTimezone: string;
  topic: string;
  learnerGoal: string;
  attemptedSummary: string;
  sharedContext: SharedSessionContext;
  mentorNote: string | null;
  cancellationReason: string | null;
  lateCancellation: boolean;
  mentorSummary: string | null;
  counterpart: { id: string | null; displayName: string; avatarUrl: string | null };
  room: { open: boolean; opensAt: string; expiresAt: string; workspaceId: string | null };
  allowedActions: SessionAction[];
  rescheduledFrom: string | null;
  offeringId: string | null;
  createdAt: string;
};
