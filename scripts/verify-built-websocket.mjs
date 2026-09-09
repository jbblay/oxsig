import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// Exercise the external ws implementation traced into the production bridge.
// A successful HTTP upgrade alone does not exercise masked frame decoding.
const routes = JSON.parse(readFileSync('.next/app-path-routes-manifest.json', 'utf8'));
const paths = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
const entry = Object.entries(routes).find(([key, path]) => path === '/__oxsig/terminal-bridge' && key.endsWith('/route'));
assert.ok(entry, 'Production bridge route must exist');
const handler = resolve('.next/server', paths[entry[0]]);
const trace = JSON.parse(readFileSync(`${handler}.nft.json`, 'utf8'));
const wsEntry = trace.files.find((file) => file.replaceAll('\\', '/').endsWith('/ws/index.js'));
assert.ok(wsEntry, 'Bridge must trace an external ws package; do not bundle its native addon loader');
const require = createRequire(import.meta.url);
const { Receiver } = require(resolve(dirname(handler), wsEntry));

for (const length of [32, 512, 65536]) {
  for (const binary of [false, true]) {
    const payload = Buffer.alloc(length, binary ? 0xa5 : 0x41);
    const extended = length < 126 ? 0 : length < 65536 ? 2 : 8;
    const frame = Buffer.alloc(2 + extended + 4 + length);
    frame[0] = binary ? 0x82 : 0x81;
    frame[1] = 0x80 | (extended === 0 ? length : extended === 2 ? 126 : 127);
    if (extended === 2) frame.writeUInt16BE(length, 2);
    if (extended === 8) frame.writeBigUInt64BE(BigInt(length), 2);
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    mask.copy(frame, 2 + extended);
    for (let i = 0; i < length; i++) frame[6 + extended + i] = payload[i] ^ mask[i % 4];
    await new Promise((resolveTest, reject) => {
      const receiver = new Receiver({ isServer: true, maxPayload: 256 * 1024 });
      let received = false;
      receiver.on('error', reject);
      receiver.on('message', (data, isBinary) => {
        try {
          assert.equal(isBinary, binary);
          assert.deepEqual(data, payload);
          received = true;
        } catch (error) { reject(error); }
      });
      receiver.write(frame, (error) => {
        if (error) return reject(error);
        try {
          assert.ok(received, 'Masked frame must reach the message handler');
          receiver.end();
          resolveTest();
        } catch (error) { reject(error); }
      });
    });
  }
}
console.log('[oxsig] Production WebSocket transport verified: six masked text/binary frames decoded.');
