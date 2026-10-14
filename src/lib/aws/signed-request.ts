import 'server-only';

import { Sha256 } from '@aws-crypto/sha256-js';
import { SSMClient } from '@aws-sdk/client-ssm';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { awsClientConfig } from './client-config';

/**
 * SigV4-signed JSON requests to AWS service endpoints that OXSIG calls without
 * a dedicated SDK client (Bedrock Runtime, SES v2). Reuses dependencies that
 * are already in the lockfile, and resolves credentials through the same
 * `awsClientConfig` chain as every other AWS client (ECS task role, instance
 * profile, AWS_PROFILE locally, or Vercel OIDC when AWS_ROLE_ARN is set).
 */
export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
};

export type AwsCredentialProvider = () => Promise<AwsCredentials>;

const credentialClients = new Map<string, SSMClient>();

/** Resolve credentials via the SDK's provider chain (cached per region; the SDK refreshes them). */
export function defaultAwsCredentials(region: string): AwsCredentialProvider {
  return async () => {
    let client = credentialClients.get(region);
    if (!client) {
      client = new SSMClient(awsClientConfig(region));
      credentialClients.set(region, client);
    }
    const credentials = client.config.credentials;
    return (typeof credentials === 'function' ? await credentials() : credentials) as AwsCredentials;
  };
}

export type SignedAwsRequest = {
  service: string;
  region: string;
  hostname: string;
  /** Already URI-encoded path, e.g. `/model/${encodeURIComponent(id)}/converse`. */
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  credentials?: AwsCredentialProvider;
  fetchImpl?: typeof fetch;
};

export async function signedAwsJsonRequest(request: SignedAwsRequest): Promise<Response> {
  const method = request.method ?? 'POST';
  const body = request.body === undefined ? undefined : JSON.stringify(request.body);
  const credentials = request.credentials ?? defaultAwsCredentials(request.region);
  // Amazon Transcribe's JSON-over-HTTP API requires an explicit payload hash.
  let payloadHash: string | undefined;
  if (request.service === 'transcribe' && body !== undefined) {
    const sha = new Sha256();
    sha.update(body);
    payloadHash = Array.from(await sha.digest(), (v) => v.toString(16).padStart(2, '0')).join('');
  }

  const signer = new SignatureV4({
    credentials,
    region: request.region,
    service: request.service,
    sha256: Sha256,
  });

  const signed = await signer.sign(new HttpRequest({
    protocol: 'https:',
    hostname: request.hostname,
    method,
    path: request.path,
    headers: {
      host: request.hostname,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      accept: 'application/json',
      ...(payloadHash ? { 'x-amz-content-sha256': payloadHash } : {}),
      ...request.headers,
    },
    body,
  }));

  const headers = { ...(signed.headers as Record<string, string>) };
  // `host` is a forbidden fetch header; the URL carries it.
  delete headers.host;

  return (request.fetchImpl ?? fetch)(`https://${request.hostname}${request.path}`, {
    method,
    headers,
    body,
    signal: request.signal,
  });
}

/** Extract a human-readable AWS JSON error without leaking request details. */
export async function awsErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  const type = response.headers.get('x-amzn-errortype')?.split(':')[0];
  const message = (payload as { message?: unknown; Message?: unknown }).message ??
    (payload as { Message?: unknown }).Message;
  const text = typeof message === 'string' && message ? message : fallback;
  return `${type ? `${type}: ` : ''}${text} (${response.status})`.slice(0, 500);
}

/**
 * Signed binary S3 requests for the voice transcription pipeline. Callers must
 * construct the AWS endpoint and encoded path from trusted configuration.
 * Unlike signedAwsJsonRequest, this keeps audio bytes and JSON results intact.
 */
export async function signedAwsBinaryRequest(
  request: Omit<SignedAwsRequest, 'body'> & { body?: Uint8Array }
): Promise<Response> {
  const method = request.method ?? 'GET';
  const credentials = request.credentials ?? defaultAwsCredentials(request.region);
  const sha = new Sha256();
  sha.update(request.body ?? new Uint8Array(0));
  const payloadHash = Array.from(await sha.digest(), (v) => v.toString(16).padStart(2, '0')).join('');
  const signer = new SignatureV4({
    credentials,
    region: request.region,
    service: request.service,
    sha256: Sha256,
  });
  const signed = await signer.sign(new HttpRequest({
    protocol: 'https:',
    hostname: request.hostname,
    method,
    path: request.path,
    headers: {
      host: request.hostname,
      ...(request.body ? { 'content-type': 'application/octet-stream' } : {}),
      'x-amz-content-sha256': payloadHash,
      ...request.headers,
    },
    body: request.body,
  }));
  const headers = { ...(signed.headers as Record<string, string>) };
  delete headers.host;
  return (request.fetchImpl ?? fetch)(`https://${request.hostname}${request.path}`, {
    method,
    headers,
    ...(request.body ? { body: request.body } : {}),
    signal: request.signal,
  });
}
