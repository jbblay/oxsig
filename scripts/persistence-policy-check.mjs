import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');

// Browser persistence is intentionally narrow. Adding a path here is a design
// decision: the reviewer should be able to explain why losing this browser state
// cannot erase an authoritative user resource.
const APPROVED_WEB_STORAGE_WRITERS = new Map([
  ['src/app/vault/page.tsx', 'ephemeral Vault navigation handoff'],
  ['src/components/app/AppShell.tsx', 'device-specific sidebar preference'],
  ['src/components/app/WorkspaceEnhancements.tsx', 'ephemeral Vault navigation handoff'],
  ['src/components/app/WorkspaceWalkthrough.tsx', 'device-specific walkthrough progress'],
  ['src/components/labs/AiPractitionerDock.tsx', 'session-scoped AI retry and handoff state'],
  ['src/components/labs/CyberLabWorkspace.tsx', 'device-specific Cyber Lab presentation mode'],
  ['src/components/labs/LabRuntimePanel.tsx', 'device/session layout and runtime-node convenience'],
  ['src/components/operations/OperationAiInstructor.tsx', 'device-specific teaching-mode preference'],
  ['src/lib/ai/client-request.ts', 'session-scoped AI request retry state'],
  ['src/lib/collab/draft-storage.ts', 'account-scoped non-authoritative collaboration draft recovery'],
  ['src/lib/persistence/workspace-activity.ts', 'non-authoritative workspace activity cache'],
  ['src/lib/vault/recovery.ts', 'account-scoped non-authoritative Vault edit recovery'],
]);

const APPROVED_INDEXED_DB_WRITERS = new Map([
  ['src/lib/storyboards/storage.ts', 'account-scoped non-authoritative Board recovery'],
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !TEST_FILE.test(entry.name)) files.push(absolute);
  }
  return files;
}

function repoPath(absolute) {
  return path.relative(ROOT, absolute).split(path.sep).join('/');
}

function lineFor(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectMatches(source, expression) {
  return [...source.matchAll(expression)].map((match) => ({
    index: match.index ?? 0,
    text: match[0],
  }));
}

const files = await walk(SOURCE_ROOT);
const violations = [];
const seenWebStorageWriters = new Set();
const seenIndexedDbWriters = new Set();

for (const absolute of files) {
  const file = repoPath(absolute);
  const source = await readFile(absolute, 'utf8');

  const webStorageWrites = collectMatches(source, /\.setItem\s*\(/g);
  if (webStorageWrites.length > 0) {
    seenWebStorageWriters.add(file);
    if (!APPROVED_WEB_STORAGE_WRITERS.has(file)) {
      for (const match of webStorageWrites) {
        violations.push(`${file}:${lineFor(source, match.index)} unapproved Web Storage write (${match.text})`);
      }
    }
  }

  const indexedDbWrites = collectMatches(source, /\b(?:openDB\s*[<(]|indexedDB\s*\.)/g);
  if (indexedDbWrites.length > 0) {
    seenIndexedDbWriters.add(file);
    if (!APPROVED_INDEXED_DB_WRITERS.has(file)) {
      for (const match of indexedDbWrites) {
        violations.push(`${file}:${lineFor(source, match.index)} unapproved IndexedDB access (${match.text})`);
      }
    }
  }

  const forbiddenPersistence = [
    ['document.cookie write', /\bdocument\.cookie\s*=/g],
    ['Cache Storage', /\bcaches\.open\s*\(/g],
    ['Origin Private File System', /\bnavigator\.storage\.getDirectory\s*\(/g],
  ];
  for (const [label, expression] of forbiddenPersistence) {
    for (const match of collectMatches(source, expression)) {
      violations.push(`${file}:${lineFor(source, match.index)} ${label} requires an explicit persistence-policy design review`);
    }
  }
}

for (const [file] of APPROVED_WEB_STORAGE_WRITERS) {
  if (!seenWebStorageWriters.has(file)) {
    violations.push(`${file} is a stale Web Storage allowlist entry; remove it instead of leaving an unused exception`);
  }
}
for (const [file] of APPROVED_INDEXED_DB_WRITERS) {
  if (!seenIndexedDbWriters.has(file)) {
    violations.push(`${file} is a stale IndexedDB allowlist entry; remove it instead of leaving an unused exception`);
  }
}

if (violations.length > 0) {
  console.error('Persistence policy check failed. Browser persistence must be non-authoritative and explicitly reviewed.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Persistence policy check passed: ${seenWebStorageWriters.size} Web Storage writer files and ${seenIndexedDbWriters.size} IndexedDB writer files are explicitly approved.`
  );
}
