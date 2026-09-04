import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';

type CredentialIdentity = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type CredentialProvider = CredentialIdentity | (() => Promise<CredentialIdentity>);
type QueryBag = Record<string, string | string[]>;

function queryFromSearchParams(params: URLSearchParams): QueryBag {
  const query: QueryBag = {};
  params.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else query[key] = [current, value];
  });
  return query;
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function queryString(query: Record<string, string | string[] | null>) {
  const entries: Array<[string, string]> = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === null) entries.push([key, '']);
    else if (Array.isArray(rawValue)) rawValue.forEach((value) => entries.push([key, value]));
    else entries.push([key, rawValue]);
  }

  return entries
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export async function presignSsmBrowserStreamUrl(
  streamUrl: string,
  region: string,
  credentials: CredentialProvider,
  expiresInSeconds = 60
) {
  const endpoint = new URL(streamUrl);
  const expectedHostname = `ssmmessages.${region}.amazonaws.com`;

  if (endpoint.protocol !== 'wss:' || endpoint.hostname !== expectedHostname) {
    throw new Error('AWS Session Manager returned an unexpected terminal stream endpoint');
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 15 || expiresInSeconds > 300) {
    throw new Error('Invalid Session Manager WebSocket signature lifetime');
  }

  const signer = new SignatureV4({
    credentials,
    region,
    service: 'ssmmessages',
    sha256: Sha256,
  });

  // The browser WebSocket API cannot attach SigV4 Authorization headers to the
  // HTTP upgrade. Query-presigning the exact AWS stream endpoint provides the
  // same authentication without exposing AWS credentials to the browser.
  const signed = await signer.presign(
    new HttpRequest({
      protocol: 'https:',
      hostname: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : undefined,
      method: 'GET',
      path: endpoint.pathname,
      query: queryFromSearchParams(endpoint.searchParams),
      headers: { host: endpoint.host },
    }),
    { expiresIn: expiresInSeconds }
  );

  const signedQuery = queryString(signed.query || {});
  const authority = signed.port ? `${signed.hostname}:${signed.port}` : signed.hostname;
  return `wss://${authority}${signed.path}${signedQuery ? `?${signedQuery}` : ''}`;
}
