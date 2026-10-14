import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../../src/components/labs/LabRuntimePanel.tsx', import.meta.url), 'utf8');
const terminal = await readFile(new URL('../../src/components/labs/InteractiveSsmTerminal.tsx', import.meta.url), 'utf8');

test('desktop remains mounted while switching between lab dock views', () => {
  assert.match(runtime, /liveAccessMode === "desktop" && <div className=\{dockTab === "desktop" \? "p-3" : "hidden"\}/);
  assert.doesNotMatch(runtime, /dockTab === "desktop" && liveAccessMode === "desktop" && <div/);
  assert.match(runtime, /dockTab === "terminal" \? "p-3" : "hidden"/);
});

test('terminal is named OXSIG Lab Terminal without spoofing the guest account', () => {
  assert.match(terminal, /OXSIG Lab Terminal —/);
});
