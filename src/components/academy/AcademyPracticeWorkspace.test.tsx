import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_TERMINAL_RESULT_EVENT, AI_TERMINAL_RUN_EVENT, type AiTerminalRunRequest } from '@/lib/labs/ai-terminal-events';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/components/labs/InteractiveSsmTerminal', () => ({
  default: () => <div data-testid="terminal">terminal</div>,
}));
vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import AcademyPracticeWorkspace from './AcademyPracticeWorkspace';

const course = {
  title: 'Linux Basics',
  topic: 'Linux',
  level: 'beginner' as const,
  overview: 'Learn Linux.',
  estimatedMinutes: 60,
  objectives: ['Inspect a system', 'Explain evidence'],
  prerequisites: [],
  lessons: [],
};

const lesson = {
  id: 'lesson-1',
  title: 'Inspect the kernel',
  summary: 'Inspect kernel details.',
  explanation: 'uname reports kernel information.',
  keyPoints: ['Kernel', 'Architecture'],
  visual: { title: 'Kernel view', nodes: ['Command', 'Kernel', 'Output'] },
  practice: {
    title: 'Run uname',
    instruction: 'Inspect kernel information.',
    command: 'uname -a',
    expected: 'Kernel details.',
    labRequired: true,
  },
  checkpoint: 'What does the output mean?',
};

const reflectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const evidenceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const executionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const labId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

describe('AcademyPracticeWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('durably captures the learner prediction before dispatching terminal execution', async () => {
    const sequence: string[] = [];
    const onResult = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/academy/reflections') {
        sequence.push('prediction-post');
        return jsonResponse({
          reflection: {
            id: reflectionId,
            lessonId: lesson.id,
            command: lesson.practice.command,
            prediction: 'I expect kernel details.',
            evidenceId: null,
            explanation: null,
            evaluation: null,
            explanationScore: null,
            status: 'predicted',
            createdAt: '2026-09-06T05:00:00.000Z',
            reflectedAt: null,
          },
        });
      }
      if (url === '/api/academy') {
        sequence.push('evaluation-post');
        return jsonResponse({
          evaluation: {
            status: 'passed',
            summary: 'Kernel details were observed.',
            feedback: 'The output matches the checkpoint.',
            nextStep: null,
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const terminalListener = (event: Event) => {
      const request = (event as CustomEvent<AiTerminalRunRequest>).detail;
      sequence.push('terminal-run');
      window.dispatchEvent(new CustomEvent(AI_TERMINAL_RESULT_EVENT, {
        detail: {
          requestId: request.requestId,
          labInstanceId: labId,
          command: lesson.practice.command,
          stdout: 'Linux lab 6.8.0 x86_64',
          stderr: '',
          exitCode: 0,
          risk: 'read-only',
          executionId,
          evidenceId,
          provenance: 'browser-observed',
          executionReceiptId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          terminalSessionId: 'session-123',
          surface: 'academy',
        },
      }));
    };
    window.addEventListener(AI_TERMINAL_RUN_EVENT, terminalListener);

    render(
      <AcademyPracticeWorkspace
        course={course}
        lesson={lesson}
        runningLab={{ id: labId, name: 'Ubuntu Lab' }}
        terminalConnected
        onResult={onResult}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('I expect this command to… because…'), {
      target: { value: 'I expect kernel details.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /capture prediction & run/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(sequence).toEqual(['prediction-post', 'terminal-run', 'evaluation-post']);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"action":"predict"');

    window.removeEventListener(AI_TERMINAL_RUN_EVENT, terminalListener);
    vi.unstubAllGlobals();
  });
});
