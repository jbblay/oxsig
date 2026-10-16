// Fixed server-selected commands only. Installation uses Ubuntu's signed repositories.
export const DOCKER_READINESS_COMMAND = [
  "if docker info >/dev/null 2>&1 && id -nG ssm-user 2>/dev/null | grep -qw docker && command -v curl >/dev/null; then echo ready;",
  "elif systemctl is-active --quiet oxsig-academy-docker.service; then echo preparing;",
  "elif test \"$(cat /var/lib/oxsig/academy-docker-status 2>/dev/null)\" = failed; then echo failed;",
  "else echo missing; fi",
].join('\n');

export const DOCKER_PREPARE_COMMAND = `systemctl is-active --quiet oxsig-academy-docker.service && exit 0
systemctl reset-failed oxsig-academy-docker.service 2>/dev/null || true
systemd-run --unit=oxsig-academy-docker --collect --property=RuntimeMaxSec=600 /bin/bash -c 'set -e; mkdir -p /var/lib/oxsig; trap "echo failed > /var/lib/oxsig/academy-docker-status" ERR; exec 9>/run/oxsig-academy-docker.lock; flock -w 30 9; echo preparing > /var/lib/oxsig/academy-docker-status; export DEBIAN_FRONTEND=noninteractive; apt-get -o DPkg::Lock::Timeout=120 update; apt-get -o DPkg::Lock::Timeout=120 install -y docker.io curl; systemctl enable --now docker; id ssm-user >/dev/null 2>&1 || useradd -m -s /bin/bash ssm-user; usermod -aG docker ssm-user; docker info >/dev/null; echo ready > /var/lib/oxsig/academy-docker-status'`;

export function dockerReadiness(stdout: string): 'ready' | 'preparing' | 'failed' | 'missing' {
  const state = stdout.trim();
  return state === 'ready' || state === 'preparing' || state === 'failed' ? state : 'missing';
}
