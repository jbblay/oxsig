import type {
  MentorApplicationStatus,
  MentorCredentialClaim,
  MentorEligibility,
  MentorProfileStatus,
  MentorProgressionStage,
  MentorTier,
  MentorTrack,
} from './policy';

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
  /** Session booking and reviews arrive in later phases; never fabricated here. */
  bookingAvailable: false;
  reviewCount: 0;
};
