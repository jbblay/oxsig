import { generateKeyPairSync } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.join(process.cwd(), '.env.local');

const defaults = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_DB: 'oxsig',
  POSTGRES_USER: 'oxsig',
  POSTGRES_PASSWORD: 'oxsig_secure_password',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_REGION: 'us-east-1',
  MINIO_ACCESS_KEY: 'minioadmin',
  MINIO_SECRET_KEY: 'minioadmin',
  MINIO_BUCKET: 'oxsig-documents',
};

let existing = '';
try {
  existing = await readFile(target, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const configuredValues = new Map();
for (const line of existing.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) configuredValues.set(match[1], match[2]);
}

const hasValue = (key) => {
  const value = configuredValues.get(key)?.trim();
  return Boolean(value && value !== "''" && value !== '\"\"');
};

const hasPrivateKey = hasValue('JWT_PRIVATE_KEY');
const hasPublicKey = hasValue('JWT_PUBLIC_KEY');
if (hasPrivateKey !== hasPublicKey) {
  throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured together.');
}

const additions = [];
for (const [key, value] of Object.entries(defaults)) {
  if (!hasValue(key)) additions.push(`${key}=${value}`);
}

if (!hasPrivateKey) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex');
  const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex');
  additions.push(`JWT_PRIVATE_KEY=${privateKeyHex}`);
  additions.push(`JWT_PUBLIC_KEY=${publicKeyHex}`);
}

if (additions.length > 0) {
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const prefix = existing.length > 0 ? '\n# Added by pnpm setup\n' : '';
  await writeFile(target, `${existing}${separator}${prefix}${additions.join('\n')}\n`, {
    mode: 0o600,
  });
  await chmod(target, 0o600);
  console.log(`Configured ${additions.length} missing values in .env.local.`);
} else {
  await chmod(target, 0o600);
  console.log('.env.local is already configured.');
}
