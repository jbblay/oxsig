// Canonical Docker mission definitions and deterministic, server-observed checks.
export const DOCKER_MISSIONS = [
  {
    id: 'deploy',
    number: '01',
    title: 'First Deployment',
    category: 'Deploy',
    objective: 'Publish a working Nginx website using a named Docker container.',
    ticket: 'Your team needs a web application at http://localhost:18080. Build the deployment on your own running Linux lab.',
    commands: ['docker info', 'docker ps -a', 'docker run -d --name oxsig-academy-web -p 18080:80 nginx:alpine', 'curl -I http://localhost:18080'],
    concepts: 'Containers share their host kernel. A published port maps a host endpoint onto an application listening inside the container.',
  },
  {
    id: 'repair',
    number: '02',
    title: 'Broken Deployment',
    category: 'Troubleshoot',
    objective: 'Diagnose and repair a server-side seeded bad port mapping.',
    ticket: 'QA reports the website is unreachable on port 18080. You may explicitly seed a safe fault in the Academy-owned container, then investigate and repair it.',
    commands: ['docker ps', 'docker port oxsig-academy-web', 'docker logs oxsig-academy-web', 'docker rm -f oxsig-academy-web', 'docker run -d --name oxsig-academy-web -p 18080:80 nginx:alpine'],
    concepts: 'Running does not imply reachable. Compare the required host port with the published Docker port and test the actual HTTP response.',
  },
  {
    id: 'persist',
    number: '03',
    title: 'Vanishing Data',
    category: 'Persistence',
    objective: 'Recreate your Nginx container with a named volume and working content.',
    ticket: 'The deployment needs a named volume oxsig_academy_data at /usr/share/nginx/html. Place the exact line OXSIG Academy persistent in index.html and restore HTTP 200.',
    commands: ['docker volume create oxsig_academy_data', 'docker rm -f oxsig-academy-web', 'docker run -d --name oxsig-academy-web -p 18080:80 -v oxsig_academy_data:/usr/share/nginx/html nginx:alpine', "docker exec oxsig-academy-web sh -c \"echo 'OXSIG Academy persistent' > /usr/share/nginx/html/index.html\""],
    concepts: 'Named volumes outlive containers. A volume mounted over Nginx document root initially hides the image files, so populate index.html and verify HTTP access.',
  },
] as const;

export type DockerMissionId = (typeof DOCKER_MISSIONS)[number]['id'];
export type MissionDifficulty = 'beginner' | 'intermediate' | 'advanced';
export const MISSION_IDS: DockerMissionId[] = ['deploy', 'repair', 'persist'];

export const DOCKER_VERIFY_COMMAND = [
  "if ! command -v docker >/dev/null 2>&1; then echo 'engine=missing'; exit 0; fi",
  "if ! docker info >/dev/null 2>&1; then echo 'engine=unavailable'; exit 0; fi",
  "echo 'engine=ready'",
  "docker inspect -f '{{.State.Running}}' oxsig-academy-web 2>/dev/null | grep -qx true && echo 'running=ok'",
  "docker port oxsig-academy-web 80/tcp 2>/dev/null | grep -Eq ':18080$' && echo 'port=ok'",
  "test \"$(curl -m 4 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/ 2>/dev/null)\" = 200 && echo 'http=ok'",
  "docker inspect -f '{{range .Mounts}}{{if eq .Destination \"/usr/share/nginx/html\"}}{{.Name}}{{end}}{{end}}' oxsig-academy-web 2>/dev/null | grep -qx oxsig_academy_data && echo 'volume=ok'",
  "docker exec oxsig-academy-web grep -Fxq 'OXSIG Academy persistent' /usr/share/nginx/html/index.html 2>/dev/null && echo 'content=ok'",
  'true',
].join('\n');

export const DOCKER_FAULT_COMMAND = [
  'set -e',
  'docker info >/dev/null',
  'docker rm -f oxsig-academy-web >/dev/null 2>&1 || true',
  'docker run -d --name oxsig-academy-web -p 18081:80 nginx:alpine',
].join('\n');

export const DOCKER_CHECKS: Record<DockerMissionId, { key: string; label: string }[]> = {
  deploy: [
    { key: 'engine', label: 'Docker daemon is accessible' },
    { key: 'running', label: 'Academy container is running' },
    { key: 'port', label: 'Port 18080 maps to container port 80' },
    { key: 'http', label: 'Real HTTP endpoint returns 200' },
  ],
  repair: [
    { key: 'engine', label: 'Docker daemon is accessible' },
    { key: 'running', label: 'Repaired Academy container is running' },
    { key: 'port', label: 'Incorrect port mapping repaired' },
    { key: 'http', label: 'Customer endpoint returns HTTP 200' },
  ],
  persist: [
    { key: 'engine', label: 'Docker daemon is accessible' },
    { key: 'running', label: 'Container is running' },
    { key: 'port', label: 'Required port is published' },
    { key: 'http', label: 'Application still returns HTTP 200' },
    { key: 'volume', label: 'Named volume is mounted at document root' },
    { key: 'content', label: 'Expected content is present in the volume' },
  ],
};

export function assessDockerMission(id: DockerMissionId, stdout: string) {
  const observed = new Set(stdout.split(/\r?\n/).map(line => line.trim()));
  const checks = DOCKER_CHECKS[id].map(({ key, label }) => ({
    key,
    label,
    passed: observed.has(key + '=' + (key === 'engine' ? 'ready' : 'ok')),
  }));
  return { checks, passed: checks.every(check => check.passed) };
}
