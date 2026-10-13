import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signedAwsJsonRequest: vi.fn(),
  awsErrorMessage: vi.fn(),
}));

vi.mock('@/lib/aws/signed-request', () => ({
  signedAwsJsonRequest: mocks.signedAwsJsonRequest,
  awsErrorMessage: mocks.awsErrorMessage,
}));

import { streamPollyTextToSpeech } from './polly';

const options = {
  text: 'Read this OXSIG lesson.',
  region: 'eu-central-1',
  voiceId: 'Joanna',
  engine: 'neural' as const,
};

describe('streamPollyTextToSpeech', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signedAwsJsonRequest.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'audio/mpeg' },
      status: 200,
    }));
  });

  it('uses the existing AWS signed request chain and returns an MP3 response', async () => {
    const response = await streamPollyTextToSpeech(options);
    expect(response.status).toBe(200);
    expect(mocks.signedAwsJsonRequest).toHaveBeenCalledWith({
      service: 'polly',
      region: 'eu-central-1',
      hostname: 'polly.eu-central-1.amazonaws.com',
      path: '/v1/speech',
      headers: { accept: 'audio/mpeg' },
      body: {
        OutputFormat: 'mp3',
        Text: options.text,
        TextType: 'text',
        VoiceId: 'Joanna',
        Engine: 'neural',
      },
    });
  });

  it('rejects empty or oversized narration without spending provider calls', async () => {
    await expect(streamPollyTextToSpeech({ ...options, text: ' ' }))
      .rejects.toThrow('Voice text is empty.');
    await expect(streamPollyTextToSpeech({ ...options, text: 'a'.repeat(3001) }))
      .rejects.toThrow('up to 3,000 characters');
    expect(mocks.signedAwsJsonRequest).not.toHaveBeenCalled();
  });

  it('does not accept arbitrary hostnames as the AWS region', async () => {
    await expect(streamPollyTextToSpeech({ ...options, region: 'us-east-1.attacker.example' }))
      .rejects.toThrow('valid AWS region');
    expect(mocks.signedAwsJsonRequest).not.toHaveBeenCalled();
  });

  it('uses bounded AWS errors and rejects responses without audio', async () => {
    mocks.signedAwsJsonRequest.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    mocks.awsErrorMessage.mockResolvedValue('ThrottlingException (429)');
    await expect(streamPollyTextToSpeech(options)).rejects.toThrow('ThrottlingException');
    mocks.signedAwsJsonRequest.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(streamPollyTextToSpeech(options)).rejects.toThrow('empty audio stream');
  });
});
