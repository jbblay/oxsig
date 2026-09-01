'use strict';

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);
const sessions = new Map();
const userSessions = new Map();

const DEFAULT_TTL_MINUTES = Math.min(
  Math.max(parseInt(process.env.LAB_TTL_MINUTES || '30', 10), 5),
  60
);

const LABS = {
  'web-recon-01': {
    id: 'web-recon-01',
    name: 'Web Recon: Exposed Debug Endpoint',
    description: 'Use Kali networking and HTTP tools to enumerate an isolated training target and find an intentionally exposed debug endpoint.',
    kaliImage: process.env.LAB_KALI_IMAGE || 'oxsig/kali-web-recon:local',
    targetImage: process.env.LAB_TARGET_IMAGE || 'oxsig/target-web-recon:local',
    targetHost: 'target',
    targetPort: 8080,
    objectives: [
      'Discover the target service and open TCP port.',
      'Fingerprint the HTTP service and response headers.',
      'Inspect robots.txt for a hidden path.',
      'Locate the exposed debug endpoint and recover the training flag.',
    ],
    hints: [
      'The target is reachable by the hostname target.',
      'Use a TCP connect scan because the Kali container has no raw-socket capability.',
      'HTTP response headers and robots.txt are worth inspecting.',
    ],
  },
};

function labsEnabled() {
  return process.env.LABS_ENABLED === 'true';
}

function dockerArgsForCommonSecurity() {
  return [
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--pids-limit', '256',
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=128m',
    '--tmpfs', '/run:rw,noexec,nosuid,nodev,size=32m',
  ];
}

async function docker(args, options = {}) {
  const { stdout = '', stderr = '' } = await execFileAsync('docker', args, {
    timeout: options.timeout || 30000,
    maxBuffer: 1024 * 1024,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function assertDockerReady() {
  if (!labsEnabled()) {
    throw new Error('Labs are disabled. Set LABS_ENABLED=true on a dedicated lab host.');
  }
  await docker(['version', '--format', '{{.Server.Version}}'], { timeout: 5000 });
}

async function assertImageExists(image) {
  try {
    await docker(['image', 'inspect', image], { timeout: 5000 });
  } catch {
    throw new Error(`Required lab image is missing: ${image}. Run lab-engine/scripts/build-images.sh first.`);
  }
}

function publicLab(lab) {
  return {
    id: lab.id,
    name: lab.name,
    description: lab.description,
    targetHost: lab.targetHost,
    targetPort: lab.targetPort,
    objectives: lab.objectives,
    hints: lab.hints,
  };
}

function publicSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    labId: session.labId,
    state: session.state,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    targetHost: session.targetHost,
    targetPort: session.targetPort,
  };
}

function getCatalog() {
  return Object.values(LABS).map(publicLab);
}

function getSessionForUser(userId) {
  const sessionId = userSessions.get(userId);
  return sessionId ? publicSession(sessions.get(sessionId)) : null;
}

function requireOwnedSession(userId, sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error('Lab session not found.');
  }
  return session;
}

async function safeRemoveContainer(name) {
  try {
    await docker(['rm', '-f', name], { timeout: 15000 });
  } catch (error) {
    if (!String(error.message).includes('No such container')) {
      console.error(`[Labs] failed to remove container ${name}:`, error.message);
    }
  }
}

async function safeRemoveNetwork(name) {
  try {
    await docker(['network', 'rm', name], { timeout: 15000 });
  } catch (error) {
    if (!String(error.message).includes('No such network')) {
      console.error(`[Labs] failed to remove network ${name}:`, error.message);
    }
  }
}

async function destroySession(session) {
  session.state = 'stopping';
  await safeRemoveContainer(session.kaliContainer);
  await safeRemoveContainer(session.targetContainer);
  await safeRemoveNetwork(session.network);
  sessions.delete(session.id);
  if (userSessions.get(session.userId) === session.id) {
    userSessions.delete(session.userId);
  }
  session.state = 'stopped';
}

async function startSession(userId, labId) {
  await assertDockerReady();

  const lab = LABS[labId];
  if (!lab) throw new Error('Unknown lab.');

  const existingId = userSessions.get(userId);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing) await destroySession(existing);
  }

  await Promise.all([
    assertImageExists(lab.kaliImage),
    assertImageExists(lab.targetImage),
  ]);

  const suffix = crypto.randomBytes(8).toString('hex');
  const id = crypto.randomUUID();
  const network = `oxsig-lab-${suffix}`;
  const kaliContainer = `oxsig-kali-${suffix}`;
  const targetContainer = `oxsig-target-${suffix}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + DEFAULT_TTL_MINUTES * 60 * 1000);

  const session = {
    id,
    userId,
    labId,
    state: 'starting',
    network,
    kaliContainer,
    targetContainer,
    targetHost: lab.targetHost,
    targetPort: lab.targetPort,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  sessions.set(id, session);
  userSessions.set(userId, id);

  try {
    await docker([
      'network', 'create',
      '--driver', 'bridge',
      '--internal',
      '--label', 'com.oxsig.lab=true',
      '--label', `com.oxsig.lab.session=${id}`,
      network,
    ]);

    await docker([
      'run', '-d',
      '--name', targetContainer,
      '--hostname', lab.targetHost,
      '--network', network,
      '--network-alias', lab.targetHost,
      '--memory', '192m',
      '--cpus', '0.25',
      ...dockerArgsForCommonSecurity(),
      '--label', 'com.oxsig.lab=true',
      '--label', `com.oxsig.lab.session=${id}`,
      lab.targetImage,
    ]);

    await docker([
      'run', '-d',
      '--name', kaliContainer,
      '--hostname', 'kali',
      '--network', network,
      '--memory', '512m',
      '--cpus', '0.75',
      ...dockerArgsForCommonSecurity(),
      '--tmpfs', '/root:rw,nosuid,nodev,size=64m',
      '--label', 'com.oxsig.lab=true',
      '--label', `com.oxsig.lab.session=${id}`,
      lab.kaliImage,
      'sleep', 'infinity',
    ]);

    session.state = 'running';
    return publicSession(session);
  } catch (error) {
    await destroySession(session);
    throw error;
  }
}

async function stopSession(userId, sessionId) {
  const session = requireOwnedSession(userId, sessionId);
  const snapshot = publicSession(session);
  await destroySession(session);
  return { ...snapshot, state: 'stopped' };
}

async function resetSession(userId, sessionId) {
  const session = requireOwnedSession(userId, sessionId);
  const labId = session.labId;
  await destroySession(session);
  return startSession(userId, labId);
}

function attachTerminal(userId, sessionId, onData, onExit) {
  const session = requireOwnedSession(userId, sessionId);
  if (session.state !== 'running') throw new Error('Lab is not running.');

  const proc = spawn(
    'docker',
    ['exec', '-i', session.kaliContainer, 'script', '-qefc', 'bash --noprofile --norc -i', '/dev/null'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  proc.stdout.on('data', chunk => onData(chunk.toString('utf8')));
  proc.stderr.on('data', chunk => onData(chunk.toString('utf8')));
  proc.on('exit', (code, signal) => onExit?.({ code, signal }));
  proc.on('error', error => onExit?.({ error: error.message }));

  return proc;
}

async function sweepExpired(onExpired) {
  const now = Date.now();
  const expired = [...sessions.values()].filter(session => Date.parse(session.expiresAt) <= now);

  for (const session of expired) {
    const snapshot = { ...session };
    await destroySession(session);
    await onExpired?.(snapshot);
  }
}

module.exports = {
  attachTerminal,
  getCatalog,
  getSessionForUser,
  publicSession,
  resetSession,
  startSession,
  stopSession,
  sweepExpired,
};
