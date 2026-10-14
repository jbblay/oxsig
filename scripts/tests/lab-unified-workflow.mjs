import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../../src/components/labs/LabRuntimePanel.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../../src/app/lab-flow.css', import.meta.url), 'utf8');

test('topology and inspector are continuously rendered without compact tab switches', () => {
  assert.match(runtime, /className="oxsig-lab-combined-workspace"/);
  assert.match(runtime, /aria-label="Lab topology"/);
  assert.match(runtime, /aria-label="Machine inspector"/);
  assert.match(runtime, /aria-label="Machine catalog"/);
  assert.doesNotMatch(runtime, /aria-label="Lab panels"/);
  assert.doesNotMatch(runtime, /Hide topology|Show topology/);
  assert.doesNotMatch(runtime, /topologyVisible &&/);
});

test('compact view shows topology and inspector then the live session rather than hiding either', () => {
  assert.match(css, /Unified compact lab workflow/);
  assert.match(css, /\.oxsig-lab-runtime \.oxsig-lab-inspector \{ width: 100%; \}/);
  assert.match(css, /\.oxsig-lab-runtime\[data-session-open="true"\] > \.oxsig-lab-combined-workspace \{\s*order: 30/);
  assert.match(css, /\.oxsig-lab-runtime\[data-session-open="true"\] > \.oxsig-lab-session:not\(\.fixed\) \{\s*order: 40/);
});
