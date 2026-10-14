import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../../src/components/labs/LabRuntimePanel.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../../src/app/lab-flow.css', import.meta.url), 'utf8');

test('machine selection leads to inspector first, then on-demand topology without compact tabs', () => {
  assert.match(runtime, /className="oxsig-lab-combined-workspace" data-testid="inspector-first-lab-workflow"/);
  assert.match(runtime, /aria-label="Lab topology"/);
  assert.match(runtime, /aria-label="Machine inspector"/);
  assert.match(runtime, /aria-label="Machine catalog"/);
  const catalog = runtime.indexOf('aria-label="Machine catalog"');
  const inspector = runtime.indexOf('aria-label="Machine inspector"');
  const topology = runtime.indexOf('aria-label="Lab topology"');
  assert.ok(catalog >= 0 && catalog < inspector && inspector < topology, 'machine catalog must lead to inspector, then topology');
  assert.match(runtime, /data-topology-visible=\{nodes\.length > 0\}/);

  assert.doesNotMatch(runtime, /aria-label="Lab panels"/);
  assert.doesNotMatch(runtime, /Hide topology|Show topology/);
  assert.doesNotMatch(runtime, /topologyVisible &&/);
});

test('responsive layout stacks inspector before conditional topology and keeps sessions below', () => {
  assert.match(css, /Unified compact lab workflow/);
  assert.match(css, /Inspector-first selection flow/);
  assert.match(css, /\.oxsig-lab-runtime \.oxsig-lab-grid \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(css, /\.oxsig-lab-canvas\[data-topology-visible="false"\] \{\s*display: none !important;/);
  assert.match(css, /\.oxsig-lab-runtime\[data-session-open="true"\] > \.oxsig-lab-combined-workspace \{\s*order: 30/);
  assert.match(css, /\.oxsig-lab-runtime\[data-session-open="true"\] > \.oxsig-lab-session:not\(\.fixed\) \{\s*order: 40/);
});
