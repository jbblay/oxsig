import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  awsErrorMessage,
  signedAwsBinaryRequest,
  signedAwsJsonRequest,
} from '@/lib/aws/signed-request';
import type { ElevenLabsTranscript } from './elevenlabs';

type MediaType = 'mp3' | 'mp4' | 'wav' | 'ogg' | 'webm' | 'm4a';
type TranscriptionJobState = 'IN_PROGRESS' | 'QUEUED' | 'COMPLETED' | 'FAILED';

export type AwsTranscribeOptions = {
  audio: Blob;
  region: string;
  bucket: string;
  languageCode?: string;
  /** A test seam; real calls use AWS and a fixed, bounded poll interval. */
  pollDelay?: () => Promise<void>;
};

function mediaFormat(mimeType: string): MediaType {
  switch (mimeType.trim().toLowerCase().split(';', 1)[0]) {
    case 'audio/webm': return 'webm';
    case 'audio/mp4': return 'mp4';
    case 'audio/mpeg': return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav': return 'wav';
    case 'audio/ogg': return 'ogg';
    default: throw new Error('Amazon Transcribe does not support this audio format.');
  }
}

function safeAwsRegion(value: string) {
  const region = value.trim();
  if (!/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(region)) {
    throw new Error('OXSIG_TRANSCRIBE_REGION is not a valid AWS region.');
  }
  return region;
}

function safeBucket(value: string) {
  const bucket = value.trim();
  if (!/^(?=.{3,63}$)(?!xn--)(?!sthree-)(?!amzn-s3-demo-)[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)
    || bucket.includes('..')
    || /^\d+\.\d+\.\d+\.\d+$/.test(bucket)) {
    throw new Error('OXSIG_TRANSCRIBE_STORAGE_BUCKET must be a valid private S3 bucket name.');
  }
  return bucket;
}

function s3ObjectRequest(region: string, bucket: string, key: string, method: 'GET' | 'PUT' | 'DELETE', body?: Uint8Array) {
  return signedAwsBinaryRequest({
    service: 's3',
    region,
    hostname: `${bucket}.s3.${region}.amazonaws.com`,
    path: `/${key.split('/').map(encodeURIComponent).join('/')}`,
    method,
    ...(body ? { body } : {}),
    ...(body ? { headers: { 'content-type': 'application/octet-stream', 'x-amz-server-side-encryption': 'AES256' } } : {}),
  });
}

async function transcribeRequest(region: string, action: 'StartTranscriptionJob' | 'GetTranscriptionJob' | 'DeleteTranscriptionJob', payload: Record<string, unknown>) {
  const response = await signedAwsJsonRequest({
    service: 'transcribe',
    region,
    hostname: `transcribe.${region}.amazonaws.com`,
    path: '/transcribe',
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `com.amazonaws.transcribe.Transcribe.${action}`,
    },
    body: payload,
  });
  if (!response.ok) throw new Error(await awsErrorMessage(response, 'Amazon Transcribe request failed'));
  return response.json() as Promise<{
    TranscriptionJob?: {
      TranscriptionJobStatus?: TranscriptionJobState;
      FailureReason?: string;
      LanguageCode?: string;
    };
  }>;
}

/**
 * Single-request bridge for OXSIG's existing /api/voice/stt contract.
 * Uses encrypted, private, short-lived S3 input/output, deletes both objects
 * in finally, and never stores/logs user audio or transcript in application
 * logs. Opt-in only; ElevenLabs remains the production default.
 *
 * The batch provider needs time to complete. Cap polling to 45s rather than
 * leaving a browser request indefinitely open. Deployments must also add
 * a one-day S3 lifecycle expiry on this prefix for crash/orphan cleanup.
 */
export async function transcribeAwsSpeech({
  audio,
  region: configuredRegion,
  bucket: configuredBucket,
  languageCode,
  pollDelay = () => new Promise<void>((resolve) => setTimeout(resolve, 1500)),
}: AwsTranscribeOptions): Promise<ElevenLabsTranscript> {
  if (!audio.size) throw new Error('Voice recording is empty.');
  if (audio.size > 10 * 1024 * 1024) throw new Error('Voice recording is too large.');
  const format = mediaFormat(audio.type);
  const region = safeAwsRegion(configuredRegion);
  const bucket = safeBucket(configuredBucket);
  const jobName = `oxsig-voice-${randomUUID()}`;
  const prefix = `voice-transcriptions/temporary/${jobName}`;
  const mediaKey = `${prefix}/recording.${format}`;
  const outputKey = `${prefix}/transcript.json`;
  const language = languageCode?.trim() || '';
  if (language && !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)) {
    throw new Error('OXSIG_TRANSCRIBE_LANGUAGE_CODE is invalid.');
  }
  let uploaded = false;
  let jobStarted = false;
  let jobTerminal = false;

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const uploadedResponse = await s3ObjectRequest(region, bucket, mediaKey, 'PUT', bytes);
    if (!uploadedResponse.ok) {
      throw new Error(await awsErrorMessage(uploadedResponse, 'Speech audio upload failed'));
    }
    uploaded = true;

    await transcribeRequest(region, 'StartTranscriptionJob', {
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: `s3://${bucket}/${mediaKey}` },
      MediaFormat: format,
      OutputBucketName: bucket,
      OutputKey: outputKey,
      ...(language ? { LanguageCode: language } : { IdentifyLanguage: true }),
    });
    jobStarted = true;

    for (let poll = 0; poll < 30; poll += 1) {
      const job = (await transcribeRequest(region, 'GetTranscriptionJob', {
        TranscriptionJobName: jobName,
      })).TranscriptionJob;
      const status = job?.TranscriptionJobStatus;
      if (status === 'FAILED') {
        jobTerminal = true;
        throw new Error('Amazon Transcribe could not process this recording.');
      }
      if (status === 'COMPLETED') {
        jobTerminal = true;
        const transcriptResponse = await s3ObjectRequest(region, bucket, outputKey, 'GET');
        if (!transcriptResponse.ok) {
          throw new Error(await awsErrorMessage(transcriptResponse, 'Speech transcript retrieval failed'));
        }
        const data = await transcriptResponse.json() as {
          results?: { transcripts?: Array<{ transcript?: string }> };
        };
        const text = data.results?.transcripts?.[0]?.transcript?.trim() || '';
        if (!text) throw new Error('Amazon Transcribe returned an empty transcript.');
        return { text, languageCode: job?.LanguageCode || language || null };
      }
      if (status !== 'QUEUED' && status !== 'IN_PROGRESS') {
        throw new Error('Amazon Transcribe returned an unexpected job state.');
      }
      await pollDelay();
    }
    throw new Error('Amazon Transcribe timed out processing the voice recording.');
  } finally {
    // Best-effort cleanup. A still-running job may reject deletion; a separate
    // 1-day S3 lifecycle rule is required as a backstop for abandoned jobs.
    const cleanup: Promise<unknown>[] = [];
    if (uploaded) cleanup.push(s3ObjectRequest(region, bucket, mediaKey, 'DELETE'));
    if (jobStarted) {
      cleanup.push(s3ObjectRequest(region, bucket, outputKey, 'DELETE'));
      if (jobTerminal) {
        cleanup.push(transcribeRequest(region, 'DeleteTranscriptionJob', {
          TranscriptionJobName: jobName,
        }));
      }
    }
    await Promise.allSettled(cleanup);
  }
}
