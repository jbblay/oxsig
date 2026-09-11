import { describe, expect, it } from 'vitest';
import {
  ACTIVE_DIRECTORY_CAPABILITIES,
  ACTIVE_DIRECTORY_PATH,
  ACTIVE_DIRECTORY_SOURCE_PROMPT,
  buildActiveDirectoryAcademyCourse,
} from './active-directory-path';

describe('Active Directory curated path', () => {
  it('keeps the seven capability stages stable and ordered', () => {
    expect(ACTIVE_DIRECTORY_PATH.id).toBe('active-directory-operations');
    expect(ACTIVE_DIRECTORY_PATH.version).toBe(1);
    expect(ACTIVE_DIRECTORY_CAPABILITIES.map((item) => item.id)).toEqual([
      'ad-foundations',
      'ad-identities-groups',
      'ad-dns-discovery',
      'ad-group-policy',
      'ad-kerberos-auth',
      'ad-security-boundaries',
      'ad-advanced-operations',
    ]);
    expect(new Set(ACTIVE_DIRECTORY_CAPABILITIES.map((item) => item.id)).size).toBe(ACTIVE_DIRECTORY_CAPABILITIES.length);
  });

  it('builds one evidence-backed live lesson for each capability', () => {
    const course = buildActiveDirectoryAcademyCourse();

    expect(ACTIVE_DIRECTORY_SOURCE_PROMPT).toBe('OXSIG curated path:active-directory-operations@1');
    expect(course.title).toBe(ACTIVE_DIRECTORY_PATH.title);
    expect(course.lessons.map((lesson) => lesson.id)).toEqual(ACTIVE_DIRECTORY_CAPABILITIES.map((item) => item.id));
    expect(course.lessons.every((lesson) => lesson.practice?.labRequired === true)).toBe(true);
    expect(course.lessons.every((lesson) => Boolean(lesson.practice?.command.trim()))).toBe(true);
    expect(course.lessons.every((lesson) => Boolean(lesson.checkpoint.trim()))).toBe(true);
  });

  it('uses the Black Domain runtime contract across the practical sequence', () => {
    const course = buildActiveDirectoryAcademyCourse();
    const commands = course.lessons.map((lesson) => lesson.practice?.command || '').join('\n');

    expect(commands).toContain('/opt/oxsig/operation.env');
    expect(commands).toContain('ldapsearch');
    expect(commands).toContain('dig');
    expect(commands).toContain('kinit');
    expect(commands).toContain('smbclient');
    expect(commands).toContain('impacket-GetUserSPNs');
  });

  it('uses the issued low-privilege identity for LDAP instead of assuming anonymous AD search', () => {
    const course = buildActiveDirectoryAcademyCourse();
    const ldapLessons = course.lessons.filter((lesson) => lesson.practice?.command.includes('ldapsearch'));

    expect(ldapLessons.length).toBeGreaterThanOrEqual(2);
    for (const lesson of ldapLessons) {
      expect(lesson.practice?.command).toContain("-D 'labuser@blackdomain.local'");
      expect(lesson.practice?.command).toContain('-w \"$INITIAL_PASSWORD\"');
      expect(lesson.practice?.instruction.toLowerCase()).not.toContain('anonymously');
    }
  });

  it('requires evidence language that distinguishes enumeration from compromise', () => {
    for (const capability of ACTIVE_DIRECTORY_CAPABILITIES) {
      expect(capability.evidence.length).toBeGreaterThan(50);
    }
    const advanced = ACTIVE_DIRECTORY_CAPABILITIES.find((item) => item.id === 'ad-advanced-operations');
    expect(advanced?.evidence.toLowerCase()).toContain('without claiming compromise');
  });
});
