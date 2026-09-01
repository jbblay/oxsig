import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

const keyPair = await subtle.generateKey(
  { name: 'Ed25519' },
  true,
  ['sign', 'verify']
);

const privateKey = new Uint8Array(await subtle.exportKey('pkcs8', keyPair.privateKey));
const publicKey = new Uint8Array(await subtle.exportKey('spki', keyPair.publicKey));

const toHex = (bytes) => Buffer.from(bytes).toString('hex');

console.log('JWT_PRIVATE_KEY=' + toHex(privateKey));
console.log('JWT_PUBLIC_KEY=' + toHex(publicKey));
console.error('\nStore these as secret environment variables. Never commit the generated private key.');
