'use strict';

const { webcrypto } = require('crypto');

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function base64UrlDecode(value) {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}

async function verifyAccessToken(token) {
  try {
    const publicKeyHex = process.env.JWT_PUBLIC_KEY;
    if (!publicKeyHex || !token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    if (header.alg !== 'EdDSA') return null;

    const publicKey = await webcrypto.subtle.importKey(
      'spki',
      Buffer.from(publicKeyHex, 'hex'),
      'Ed25519',
      false,
      ['verify']
    );

    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
    const signature = base64UrlDecode(signatureB64);
    const valid = await webcrypto.subtle.verify('Ed25519', publicKey, signature, signingInput);
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (!payload.sub || payload.type !== 'access' || !payload.exp || payload.exp < now) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('[Labs] JWT verification failed:', error.message);
    return null;
  }
}

async function authenticateLabSocket(socket) {
  const cookies = parseCookies(socket.request?.headers?.cookie || '');
  return verifyAccessToken(cookies.accessToken);
}

module.exports = {
  authenticateLabSocket,
  verifyAccessToken,
};
