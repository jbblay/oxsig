import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  signedAwsBinaryRequest: vi.fn(),
  signedAwsJsonRequest: vi.fn(),
  awsErrorMessage: vi.fn(),
}));

vi.mock('@/lib/aws/signed-request', () => ({
  signedAwsBinaryRequest: mocks.signedAwsBinaryRequest,
  signedAwsJsonRequest: mocks.signedAwsJsonRequest,
  awsErrorMessage: mocks.awsErrorMessage,
}));

import { transcribeAwsSpeech } from './transcribe';

const opts = {
  region: 'eu-central-1',
  bucket: 'oxsig-private-test-bucket',
  audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
  pollDelay: async () => {},
};

function reply(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('transcribeAwsSpeech', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signedAwsBinaryRequest.mockImplementation(async (req: { method: string }) => (
      req.method === 'GET'
        ? reply({ results: { transcripts: [{ transcript: 'I can hear you.' }] } })
        : new Response(null, { status: 200 })
    ));
    mocks.signedAwsJsonRequest.mockImplementation(async (req: { headers?: Record<string, string> }) => {
      if (req.headers?.['x-amz-target']?.endsWith('GetTranscriptionJob')) {
        return reply({
          TranscriptionJob: { TranscriptionJobStatus: 'COMPLETED', LanguageCode: 'en-US' },
        });
      }
      return reply({});
    });
  });

  it('uploads audio privately and returns the AWS transcript, cleaning S3 objects', async () => {
    expect(await transcribeAwsSpeech(opts)).toEqual({ text: 'I can hear you.', languageCode: 'en-US' });
    const binCalls = mocks.signedAwsBinaryRequest.mock.calls.map(([arg]) => arg);
    expect(binCalls.map((c: { method: string }) => c.method)).toEqual(['PUT', 'GET', 'DELETE', 'DELETE']);
    expect(binCalls[0].headers['x-amz-server-side-encryption']).toBe('AES256');
    expect(binCalls[0].hostname).toBe('oxsig-private-test-bucket.s3.eu-central-1.amazonaws.com');
    expect(binCalls[0].path).toMatch(/^\/voice-transcriptions\/temporary\/oxsig-voice-/);
    expect(binCalls[0].path).not.toContain('I can hear you.');
    const apiCalls = mocks.signedAwsJsonRequest.mock.calls.map(([arg]) => arg);
    expect(apiCalls.map((c: { headers: Record<string, string> }) => c.headers['x-amz-target'].split('.').at(-1)))
      .toEqual(['StartTranscriptionJob', 'GetTranscriptionJob', 'DeleteTranscriptionJob']);
    expect(apiCalls[0].body.MediaFormat).toBe('webm');
    expect(apiCalls[0].body.IdentifyLanguage).toBe(true);
    expect(apiCalls[0].path).toBe('/transcribe');
    expect(apiCalls[0].headers['content-type']).toBe('application/x-amz-json-1.1');
  });

  it('accepts explicit language choice without automatic language detection', async () => {
    await transcribeAwsSpeech({ ...opts, languageCode: 'en-GB' });
    const req = mocks.signedAwsJsonRequest.mock.calls[0][0];
    expect(req.body.LanguageCode).toBe('en-GB');
    expect(req.body.IdentifyLanguage).toBeUndefined();
  });

  it('rejects unsupported browser audio types without AWS operations', async () => {
    await expect(transcribeAwsSpeech({
      ...opts, audio: new Blob([new Uint8Array([1])], { type: 'audio/aac' }),
    })).rejects.toThrow('does not support this audio format');
    expect(mocks.signedAwsBinaryRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid bucket and region before uploading user data', async () => {
    await expect(transcribeAwsSpeech({ ...opts, bucket: 'bad.bucket.example/path' }))
      .rejects.toThrow('valid private S3 bucket');
    await expect(transcribeAwsSpeech({ ...opts, region: 'eu-central-1.evil' }))
      .rejects.toThrow('valid AWS region');
    expect(mocks.signedAwsBinaryRequest).not.toHaveBeenCalled();
  });

  it('returns a failure and cleans temporary inputs when the job fails', async () => {
    mocks.signedAwsJsonRequest.mockImplementation(async (req: { headers?: Record<string, string> }) =>
      reply(req.headers?.['x-amz-target']?.endsWith('GetTranscriptionJob')
        ? { TranscriptionJob: { TranscriptionJobStatus: 'FAILED' } }
        : {})
    );
    await expect(transcribeAwsSpeech(opts)).rejects.toThrow('could not process');
    const calls = mocks.signedAwsBinaryRequest.mock.calls.map(([arg]) => arg);
    expect(calls.map((c: { method: string }) => c.method)).toEqual(['PUT', 'DELETE', 'DELETE']);
  });

  it('returns a timeout after bounded polling without waiting indefinitely', async () => {
    mocks.signedAwsJsonRequest.mockImplementation(async (req: { headers?: Record<string, string> }) =>
      reply(req.headers?.['x-amz-target']?.endsWith('GetTranscriptionJob')
        ? { TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } }
        : {})
    );
    await expect(transcribeAwsSpeech(opts)).rejects.toThrow('timed out');
    const polls = mocks.signedAwsJsonRequest.mock.calls.filter(([arg]) =>
      arg.headers['x-amz-target'].endsWith('GetTranscriptionJob'));
    expect(polls).toHaveLength(30);
  });
});
