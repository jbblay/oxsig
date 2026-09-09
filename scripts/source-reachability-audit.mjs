import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const nextEntryNames = new Set([
  'page', 'layout', 'route', 'loading', 'error', 'not-found', 'default',
  'template', 'global-error', 'sitemap', 'robots', 'manifest', 'icon',
  'apple-icon', 'opengraph-image', 'twitter-image',
]);

function normalize(file) {
  return path.normalize(file);
}

function isIgnored(file) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  return rel.includes('/node_modules/') || rel.startsWith('node_modules/') ||
    rel.includes('/.next/') || rel.startsWith('.next/') ||
    rel.includes('/__tests__/') || rel.startsWith('src/test/') || rel.startsWith('src/tests/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) || rel.endsWith('.d.ts');
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) walk(file, output);
    } else if (extensions.includes(path.extname(entry.name)) && !isIgnored(file)) {
      output.push(normalize(file));
    }
  }
  return output;
}

const srcFiles = new Set(walk(srcRoot));
const graphFiles = new Set(srcFiles);
for (const extra of ['server.mjs', 'next.config.ts', 'vitest.config.ts']) {
  const file = normalize(path.join(root, extra));
  if (fs.existsSync(file)) graphFiles.add(file);
}
for (const file of walk(path.join(root, 'scripts'))) graphFiles.add(file);

function resolveModule(importer, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(srcRoot, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(importer), specifier);
  else return null;

  const candidates = [base];
  if (/\.(js|jsx|mjs|cjs)$/.test(base)) candidates.push(base.replace(/\.(js|jsx|mjs|cjs)$/, ''));
  for (const candidate of [...candidates]) {
    if (path.extname(candidate)) {
      if (graphFiles.has(normalize(candidate))) return normalize(candidate);
    } else {
      for (const ext of extensions) {
        const file = normalize(candidate + ext);
        if (graphFiles.has(file)) return file;
      }
      for (const ext of extensions) {
        const file = normalize(path.join(candidate, `index${ext}`));
        if (graphFiles.has(file)) return file;
      }
    }
  }
  return null;
}

function moduleSpecifiers(file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const specs = new Set();

  function add(node) {
    if (node && ts.isStringLiteralLike(node)) specs.add(node.text);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specs;
}

const roots = new Set();
for (const file of graphFiles) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (rel.startsWith('src/app/')) {
    const name = path.basename(file).replace(/\.[^.]+$/, '');
    if (nextEntryNames.has(name)) roots.add(file);
  } else if (['src/middleware.ts', 'src/instrumentation.ts', 'src/instrumentation-client.ts'].includes(rel)) {
    roots.add(file);
  } else if (rel === 'server.mjs' || rel.startsWith('scripts/')) {
    roots.add(file);
  }
}

const reachable = new Set();
const queue = [...roots];
while (queue.length) {
  const file = queue.pop();
  if (!file || reachable.has(file)) continue;
  reachable.add(file);
  for (const specifier of moduleSpecifiers(file)) {
    const target = resolveModule(file, specifier);
    if (target && !reachable.has(target)) queue.push(target);
  }
}

const unreachable = [...srcFiles]
  .filter((file) => !reachable.has(file))
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  .sort();

console.log(`Reachability roots: ${roots.size}`);
console.log(`Production source files: ${srcFiles.size}`);
console.log(`Reachable production files: ${[...srcFiles].filter((file) => reachable.has(file)).length}`);
if (unreachable.length) {
  console.error(`Unreachable production source files (${unreachable.length}):`);
  for (const file of unreachable) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log('No unreachable production source files found.');
}
