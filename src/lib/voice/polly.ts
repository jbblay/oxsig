import 'server-only';

import { awsErrorMessage, signedAwsJsonRequest } from '@/lib/aws/signed-request';

export type PollyTtsOptions = {
  text: string;
  region: string;
  voiceId: string;
  engine: 'standard' | 'neural' | 'generative';
};

/**
 * AWS Polly synchronous synthesis. The response is an MP3 stream, preserving the
 * existing /api/voice/tts contract. Credentials come from the established
 * AWS SDK/OIDC credential chain, never from browser-visible settings.
 *
 * Polly's SynthesizeSpeech API accepts at most 3,000 billed text characters.
 * Longer narration can use the explicitly configured secondary provider.
 */
export async function streamPollyTextToSpeech({
  text,
  region,
  voiceId,
  engine,
}: PollyTtsOptions): Promise<Response> {
  const spokenText = text.trim();
  if (!spokenText) throw new Error('Voice text is empty.');
  if ([...spokenText].length > 3_000) {
    throw new Error('Amazon Polly supports up to 3,000 characters per synchronous speech request.');
  }

  const awsRegion = region.trim();
  const voice = voiceId.trim();
  if (!awsRegion || !/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(awsRegion)) {
    throw new Error('OXSIG_POLLY_REGION must be a valid AWS region.');
  }
  if (!voice || !/^[A-Za-z]+$/.test(voice)) {
    throw new Error('OXSIG_POLLY_VOICE_ID must be an Amazon Polly voice identifier.');
  }

  const response = await signedAwsJsonRequest({
    service: 'polly',
    region: awsRegion,
    hostname: `polly.${awsRegion}.amazonaws.com`,
    path: '/v1/speech',
    headers: { accept: 'audio/mpeg' },
    body: {
      OutputFormat: 'mp3',
      Text: spokenText,
      TextType: 'text',
      VoiceId: voice,
      Engine: engine,
    },
  });

  if (!response.ok) {
    throw new Error(await awsErrorMessage(response, 'Amazon Polly speech synthesis failed'));
  }
  if (!response.body) throw new Error('Amazon Polly returned an empty audio stream.');
  return response;
}
