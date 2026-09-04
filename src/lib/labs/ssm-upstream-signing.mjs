import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';

function queryFromSearchParams(params) {
  const query = {};
  params.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else query[key] = [current, value];
  });
  return query;
}

export function validateSsmUpstreamUrl(streamUrl, region) {
  const endpoint = new URL(streamUrl);
  const expectedHostname = `ssmmessages.${region}.amazonaws.com`;

  if (
    endpoint.protocol !== 'wss:' ||
    endpoint.hostname !== expectedHostname ||
    !endpoint.pathname.startsWith('/v1/data-channel/') ||
    endpoint.searchParams.get('role') !== 'publish_subscribe'
  ) {
    throw new Error('AWS Session Manager returned an unexpected terminal stream endpoint');
  }

  return endpoint;
}

export async function signSsmUpstreamHeaders(streamUrl, region, credentials) {
  const endpoint = validateSsmUpstreamUrl(streamUrl, region);
  const signer = new SignatureV4({
    credentials,
    region,
    service: 'ssmmessages',
    sha256: Sha256,
  });

  // Match the official Session Manager plugin: sign the WebSocket HTTP GET with
  // SigV4 headers on the server, where Node can actually attach Authorization.
  const signed = await signer.sign(
    new HttpRequest({
      protocol: 'https:',
      hostname: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : undefined,
      method: 'GET',
      path: endpoint.pathname,
      query: queryFromSearchParams(endpoint.searchParams),
      headers: { host: endpoint.host },
    })
  );

  const headers = {};
  for (const [name, value] of Object.entries(signed.headers || {})) {
    // ws will emit the Host header itself. It is still part of the signature;
    // omitting only the duplicate header avoids Node rejecting two Host values.
    if (name.toLowerCase() !== 'host' && typeof value === 'string') headers[name] = value;
  }
  return headers;
}
