import 'server-only';

import { SendCommandCommand, SSMClient, StartSessionCommand } from '@aws-sdk/client-ssm';
import { executeLabCommand } from './aws-runtime';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const INSTANCE_ID = /^i-[0-9a-f]+$/i;
const ssm = new SSMClient({ region: REGION });

export type DesktopPlatform = 'linux' | 'windows';

export type DesktopServiceInspection = {
  platform: DesktopPlatform;
  serviceName: string;
  expectedPort: number;
  serviceInstalled: boolean;
  serviceState: string;
  serviceRunning: boolean;
  readyMarkerPresent: boolean;
  listenerPresent: boolean;
  listenerAddress: string | null;
  loopbackOnly: boolean;
  ready: boolean;
  exitCode: number;
};

function assertAwsInstanceId(instanceId: string) {
  if (!INSTANCE_ID.test(instanceId)) throw new Error('Invalid AWS lab instance identifier');
}

export function desktopPortFor(platform: DesktopPlatform) {
  return platform === 'windows' ? 5900 : 5901;
}

const linuxDesktopBootstrap = String.raw`set -eu
ROOT=/var/lib/oxsig
READY="$ROOT/desktop-ready"
LOCK="$ROOT/desktop-installing"
mkdir -p "$ROOT"
[ -f "$READY" ] && exit 0
if ! mkdir "$LOCK" 2>/dev/null; then exit 0; fi
cleanup() { rmdir "$LOCK" 2>/dev/null || true; }
trap cleanup EXIT
export DEBIAN_FRONTEND=noninteractive
if ! command -v apt-get >/dev/null 2>&1; then
  echo 'Desktop bootstrap requires a Debian-compatible lab image' >&2
  exit 1
fi
apt-get update -y
apt-get install -y xfce4 xfce4-terminal dbus-x11 tigervnc-standalone-server
id -u oxsig-desktop >/dev/null 2>&1 || useradd -m -s /bin/bash oxsig-desktop
install -d -m 700 -o oxsig-desktop -g oxsig-desktop /home/oxsig-desktop/.vnc
cat >/home/oxsig-desktop/.vnc/xstartup <<'EOF'
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4
EOF
chmod 700 /home/oxsig-desktop/.vnc/xstartup
chown -R oxsig-desktop:oxsig-desktop /home/oxsig-desktop/.vnc
cat >/etc/systemd/system/oxsig-desktop-vnc.service <<'EOF'
[Unit]
Description=Oxsig private browser desktop
After=network.target

[Service]
Type=simple
User=oxsig-desktop
Environment=HOME=/home/oxsig-desktop
ExecStart=/usr/bin/tigervncserver :1 -fg -localhost yes -SecurityTypes None -geometry 1440x900 -depth 24
ExecStop=/usr/bin/tigervncserver -kill :1
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now oxsig-desktop-vnc.service
touch "$READY"`;

const windowsDesktopBootstrap = String.raw`$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\Oxsig'
$ready = Join-Path $root 'desktop-ready'
$lock = Join-Path $root 'desktop-installing'
New-Item -ItemType Directory -Force -Path $root | Out-Null
if (Test-Path $ready) { exit 0 }
try { New-Item -ItemType File -Path $lock -ErrorAction Stop | Out-Null } catch { exit 0 }
try {
  $msi = Join-Path $root 'tightvnc-2.8.88-gpl-setup-64bit.msi'
  $expectedSha256 = 'FA86D817AC29C5FFE1E8E7095E738D9BA5CA28AA62304AC234580916622A8CA2'
  Invoke-WebRequest -UseBasicParsing 'https://www.tightvnc.com/download/2.8.88/tightvnc-2.8.88-gpl-setup-64bit.msi' -OutFile $msi
  $actualSha256 = (Get-FileHash -Algorithm SHA256 -Path $msi).Hash.ToUpperInvariant()
  if ($actualSha256 -ne $expectedSha256) {
    Remove-Item -Force -ErrorAction SilentlyContinue $msi
    throw "TightVNC installer checksum mismatch; refusing to execute unverified desktop bootstrap content"
  }
  $arguments = @('/i', ('"' + $msi + '"'), '/quiet', '/norestart', 'ADDLOCAL=Server', 'SET_ACCEPTHTTPCONNECTIONS=1', 'VALUE_OF_ACCEPTHTTPCONNECTIONS=0', 'SET_ACCEPTRFBCONNECTIONS=1', 'VALUE_OF_ACCEPTRFBCONNECTIONS=1', 'SET_ALLOWLOOPBACK=1', 'VALUE_OF_ALLOWLOOPBACK=1', 'SET_LOOPBACKONLY=1', 'VALUE_OF_LOOPBACKONLY=1', 'SET_USEVNCAUTHENTICATION=1', 'VALUE_OF_USEVNCAUTHENTICATION=0', 'SET_ALWAYSSHARED=1', 'VALUE_OF_ALWAYSSHARED=1')
  $process = Start-Process msiexec.exe -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) { throw "TightVNC installer exited with $($process.ExitCode)" }
  Set-Service -Name tvnserver -StartupType Automatic
  Start-Service -Name tvnserver
  New-Item -ItemType File -Force -Path $ready | Out-Null
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $lock
}`;

function parseInspectionOutput(stdout: string) {
  const fields = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  return fields;
}

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized.startsWith('127.0.0.1:') || normalized.startsWith('[::1]:');
}

export async function inspectDesktopService(instanceId: string, platform: DesktopPlatform): Promise<DesktopServiceInspection> {
  assertAwsInstanceId(instanceId);
  const expectedPort = desktopPortFor(platform);
  const serviceName = platform === 'windows' ? 'tvnserver' : 'oxsig-desktop-vnc.service';
  const command = platform === 'windows'
    ? "$s=Get-Service tvnserver -EA SilentlyContinue;$c=Get-NetTCPConnection -State Listen -LocalPort 5900 -EA SilentlyContinue|Select-Object -First 1;$m=Test-Path 'C:\\ProgramData\\Oxsig\\desktop-ready';Write-Output ('installed='+[bool]$s);Write-Output ('state='+$(if($s){$s.Status}else{'Missing'}));Write-Output ('marker='+$m);Write-Output ('listener='+$(if($c){$c.LocalAddress}else{''}))"
    : "load=$(systemctl show -p LoadState --value oxsig-desktop-vnc.service 2>/dev/null||echo not-found);state=$(systemctl is-active oxsig-desktop-vnc.service 2>/dev/null||true);marker=false;[ -f /var/lib/oxsig/desktop-ready ]&&marker=true;listener=$(ss -ltnH 2>/dev/null|awk '$4 ~ /:5901$/ {print $4; exit}');printf 'installed=%s\\nstate=%s\\nmarker=%s\\nlistener=%s\\n' \"$([ \"$load\" != not-found ]&&echo true||echo false)\" \"$state\" \"$marker\" \"$listener\"";

  const result = await executeLabCommand(instanceId, command, platform);
  const fields = parseInspectionOutput(result.stdout);
  const listenerAddress = fields.get('listener') || null;
  const serviceInstalled = (fields.get('installed') || '').toLowerCase() === 'true';
  const serviceState = fields.get('state') || 'unknown';
  const serviceRunning = platform === 'windows'
    ? serviceState.toLowerCase() === 'running'
    : serviceState.toLowerCase() === 'active';
  const readyMarkerPresent = (fields.get('marker') || '').toLowerCase() === 'true';
  const listenerPresent = Boolean(listenerAddress);
  const loopbackOnly = isLoopbackAddress(listenerAddress || undefined);
  const ready = result.exitCode === 0 && serviceInstalled && serviceRunning && readyMarkerPresent && listenerPresent && loopbackOnly;

  return {
    platform,
    serviceName,
    expectedPort,
    serviceInstalled,
    serviceState,
    serviceRunning,
    readyMarkerPresent,
    listenerPresent,
    listenerAddress,
    loopbackOnly,
    ready,
    exitCode: result.exitCode,
  };
}

async function readiness(instanceId: string, platform: DesktopPlatform) {
  const command = platform === 'windows'
    ? "$service=Get-Service tvnserver -ErrorAction SilentlyContinue; if($service -and $service.Status -eq 'Running'){exit 0}else{exit 1}"
    : "systemctl is-active --quiet oxsig-desktop-vnc.service && test -f /var/lib/oxsig/desktop-ready";
  try {
    const result = await executeLabCommand(instanceId, command, platform);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function ensureDesktopRuntime(instanceId: string, platform: DesktopPlatform) {
  assertAwsInstanceId(instanceId);
  if (await readiness(instanceId, platform)) return { ready: true, bootstrapStarted: false };

  const documentName = platform === 'windows' ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript';
  const bootstrap = platform === 'windows' ? windowsDesktopBootstrap : linuxDesktopBootstrap;
  await ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: documentName,
    Parameters: { commands: [bootstrap] },
    TimeoutSeconds: 600,
  }));

  return { ready: false, bootstrapStarted: true };
}

export async function startDesktopPortSession(instanceId: string, platform: DesktopPlatform) {
  assertAwsInstanceId(instanceId);
  const port = String(desktopPortFor(platform));
  const result = await ssm.send(new StartSessionCommand({
    Target: instanceId,
    DocumentName: 'AWS-StartPortForwardingSession',
    Parameters: {
      portNumber: [port],
      localPortNumber: [port],
    },
    Reason: 'Oxsig private browser desktop',
  }));

  if (!result.SessionId || !result.StreamUrl || !result.TokenValue) {
    throw new Error('AWS Session Manager did not return a complete desktop port session');
  }

  return {
    sessionId: result.SessionId,
    streamUrl: result.StreamUrl,
    tokenValue: result.TokenValue,
    region: REGION,
    port: Number(port),
  };
}
