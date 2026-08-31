import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';
import { describe, expect, it } from 'vitest';
import { verifyEd25519DocumentSignature } from './ed25519';

function base64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

describe('verifyEd25519DocumentSignature', () => {
  it('accepts a valid signature over the stored SHA-256 digest', async () => {
    const secretKey = utils.randomSecretKey();
    const publicKey = await getPublicKeyAsync(secretKey);
    const digest = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('OxSig document'),
    ));
    const signature = await signAsync(digest, secretKey);

    await expect(verifyEd25519DocumentSignature({
      signatureData: base64(signature),
      publicKey: base64(publicKey),
      contentHash: Buffer.from(digest).toString('hex'),
    })).resolves.toBe(true);
  });

  it('rejects a signature when the document digest changes', async () => {
    const secretKey = utils.randomSecretKey();
    const publicKey = await getPublicKeyAsync(secretKey);
    const digest = crypto.getRandomValues(new Uint8Array(32));
    const signature = await signAsync(digest, secretKey);
    digest[0] ^= 0xff;

    await expect(verifyEd25519DocumentSignature({
      signatureData: base64(signature),
      publicKey: base64(publicKey),
      contentHash: Buffer.from(digest).toString('hex'),
    })).resolves.toBe(false);
  });

  it('rejects malformed encodings', async () => {
    await expect(verifyEd25519DocumentSignature({
      signatureData: 'not-base64',
      publicKey: 'also-invalid',
      contentHash: '00',
    })).resolves.toBe(false);
  });
});
