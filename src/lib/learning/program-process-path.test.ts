import { describe, expect, it } from 'vitest';
import {
  buildProgramProcessAcademyCourse,
  PROGRAM_PROCESS_CAPABILITIES,
  PROGRAM_PROCESS_PATH,
  PROGRAM_PROCESS_SOURCE_PROMPT,
} from './program-process-path';

describe('program-to-process reference path', () => {
  it('keeps a stable ordered capability map for the reference learning journey', () => {
    expect(PROGRAM_PROCESS_PATH.id).toBe('program-becomes-process');
    expect(PROGRAM_PROCESS_PATH.version).toBe(1);
    expect(PROGRAM_PROCESS_CAPABILITIES.map((item) => item.id)).toEqual([
      'command-resolution',
      'fork-copy-on-write',
      'execve-elf',
      'virtual-address-space',
      'runtime-startup',
      'process-context',
      'syscalls-scheduling',
      'exit-wait-zombie',
    ]);
    expect(new Set(PROGRAM_PROCESS_CAPABILITIES.map((item) => item.id)).size).toBe(PROGRAM_PROCESS_CAPABILITIES.length);
  });

  it('builds the Academy course from the same stable capability ids instead of inventing another syllabus', () => {
    const course = buildProgramProcessAcademyCourse();

    expect(PROGRAM_PROCESS_SOURCE_PROMPT).toBe('OXSIG curated path:program-becomes-process@1');
    expect(course.title).toBe(PROGRAM_PROCESS_PATH.title);
    expect(course.lessons).toHaveLength(PROGRAM_PROCESS_CAPABILITIES.length);
    expect(course.lessons.map((lesson) => lesson.id)).toEqual(PROGRAM_PROCESS_CAPABILITIES.map((item) => item.id));
    expect(course.lessons.every((lesson) => lesson.practice?.labRequired === true)).toBe(true);
    expect(course.lessons.every((lesson) => Boolean(lesson.checkpoint.trim()))).toBe(true);
  });

  it('keeps shell escape sequences literal so the curated course contains no NUL code point', () => {
    const course = buildProgramProcessAcademyCourse();
    const serialized = JSON.stringify(course);
    const command = course.lessons.find((lesson) => lesson.id === 'process-context')?.practice?.command;

    expect(serialized).not.toContain('\\u0000');
    expect(command).toContain(String.raw`tr '\0' '\n'`);
  });

  it('requires prediction/observation/explanation-oriented practical work rather than page completion', () => {
    const course = buildProgramProcessAcademyCourse();

    expect(course.overview).toContain('predict first');
    expect(course.overview).toContain('explain');
    for (const capability of PROGRAM_PROCESS_CAPABILITIES) {
      expect(capability.evidence.length).toBeGreaterThan(40);
    }
    for (const lesson of course.lessons) {
      expect(lesson.practice?.instruction.toLowerCase()).toContain('predict');
    }
  });
});