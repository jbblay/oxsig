export const EXPERIENCE_LEVELS = [
  { id: 'new', label: 'New to security', hint: 'Guided lessons first' },
  { id: 'practitioner', label: 'Practitioner', hint: 'Hands-on labs' },
  { id: 'professional', label: 'Professional', hint: 'Realistic operations' },
  { id: 'expert', label: 'Expert', hint: 'Team war games' },
] as const;

export const FOCUS_AREAS = [
  { id: 'red-team', label: 'Red team' },
  { id: 'blue-team', label: 'Blue team' },
  { id: 'cloud', label: 'Cloud security' },
  { id: 'active-directory', label: 'Active Directory' },
  { id: 'web', label: 'Web apps' },
  { id: 'network', label: 'Networking' },
  { id: 'forensics', label: 'Forensics & IR' },
  { id: 'devsecops', label: 'DevSecOps' },
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]['id'];
export type FocusArea = (typeof FOCUS_AREAS)[number]['id'];

export const EXPERIENCE_LEVEL_IDS = EXPERIENCE_LEVELS.map((level) => level.id) as [ExperienceLevel, ...ExperienceLevel[]];
export const FOCUS_AREA_IDS = FOCUS_AREAS.map((area) => area.id) as [FocusArea, ...FocusArea[]];

export interface AccountProfile {
  id: string;
  publicKey: string;
  displayName: string;
  email?: string;
  bio: string;
  avatarUrl: string;
  headline: string;
  location: string;
  websiteUrl: string;
  experienceLevel: ExperienceLevel | null;
  focusAreas: FocusArea[];
  role: 'user' | 'admin';
  isFounder: boolean;
  isActive: boolean;
  emailVerified: boolean;
  onboardedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSeenAt: string | null;
}

/** Where a newly onboarded operator lands so their first minute is productive. */
export function recommendedStart(level: ExperienceLevel | null | undefined) {
  switch (level) {
    case 'practitioner':
      return { href: '/labs', label: 'Build your first lab' };
    case 'professional':
      return { href: '/operations', label: 'Launch an operation' };
    case 'expert':
      return { href: '/warroom', label: 'Enter the WarRoom' };
    default:
      return { href: '/academy', label: 'Start your first lesson' };
  }
}

export function profileCompleteness(profile: Pick<AccountProfile, 'displayName' | 'headline' | 'bio' | 'avatarUrl' | 'experienceLevel' | 'focusAreas'>) {
  const checks = [
    { id: 'name', label: 'Display name', done: profile.displayName.trim().length >= 2 },
    { id: 'headline', label: 'Headline', done: profile.headline.trim().length > 0 },
    { id: 'experience', label: 'Experience level', done: Boolean(profile.experienceLevel) },
    { id: 'focus', label: 'Focus areas', done: profile.focusAreas.length > 0 },
    { id: 'bio', label: 'Bio', done: profile.bio.trim().length > 0 },
    { id: 'avatar', label: 'Avatar', done: profile.avatarUrl.trim().length > 0 },
  ];
  const done = checks.filter((check) => check.done).length;
  return { percent: Math.round((done / checks.length) * 100), checks, missing: checks.filter((check) => !check.done) };
}
