import { z } from 'zod';

/**
 * Public curriculum metadata. Options are visible, but all grading,
 * unlock decisions and points are calculated on the server.
 * The same shape can later describe hardware, networks and code challenges.
 */
export const SIMULATOR_VERSION = 1;
export const SIMULATION_SKILL = 'docker' as const;
export const SIMULATION_SP_PER_STAGE = 25;
export const DOCKER_SIMULATION_STAGES = [
  {
    id: 'container',
    chapter: 1,
    title: 'The Container Workshop',
    environment: 'visual-workbench',
    instruction: 'Prepare a lightweight web server container. Select an image and an Academy-owned container name.',
    explanation: 'An image is the blueprint. A container is its running instance. Names identify the specific instance you inspect and maintain.',
    from: 'Image registry',
    to: 'Docker Engine',
    slots: [
      { id: 'image', label: 'Image', hint: 'Choose a minimal web-server image',
        options: [{ value: 'nginx:alpine', label: 'Nginx · Alpine' }, { value: 'ubuntu:latest', label: 'Ubuntu · generic' }, { value: 'redis:alpine', label: 'Redis · cache' }] },
      { id: 'name', label: 'Container name', hint: 'Use the reserved Academy container name',
        options: [{ value: 'oxsig-academy-web', label: 'oxsig-academy-web' }, { value: 'production-database', label: 'production-database' }, { value: 'my-container', label: 'my-container' }] },
    ],
  },
  {
    id: 'network',
    chapter: 2,
    title: 'Connect the Service',
    environment: 'network-topology',
    instruction: 'Publish the container web service through the correct port and test its simulated HTTP endpoint.',
    explanation: 'Publishing a port connects the host endpoint to a service inside the container. A running container is not necessarily reachable.',
    from: 'Browser',
    to: 'Container :80',
    slots: [
      { id: 'publish', label: 'Host → container port', hint: 'The customer endpoint must be host port 18080',
        options: [{ value: '18080:80', label: '18080 → 80' }, { value: '18081:80', label: '18081 → 80' }, { value: '80:18080', label: '80 → 18080' }] },
      { id: 'url', label: 'Test endpoint', hint: 'Use the required host port, not the internal port',
        options: [{ value: 'http://localhost:18080', label: 'localhost:18080' }, { value: 'http://localhost:18081', label: 'localhost:18081' }, { value: 'http://localhost:80', label: 'localhost:80' }] },
    ],
  },
  {
    id: 'storage',
    chapter: 3,
    title: 'Keep the Data',
    environment: 'storage-workshop',
    instruction: 'Mount a named volume and place the expected page marker inside the container document root.',
    explanation: 'A named volume survives container replacement. The volume must be mounted at the application document root and contain valid web content.',
    from: 'Named volume',
    to: 'Nginx document root',
    slots: [
      { id: 'mount', label: 'Volume → mount target', hint: 'Persist the Nginx web document root',
        options: [{ value: 'oxsig_academy_data:/usr/share/nginx/html', label: 'academy_data → /usr/share/nginx/html' }, { value: 'temp:/tmp', label: 'temp → /tmp' }, { value: 'oxsig_academy_data:/var/log', label: 'academy_data → /var/log' }] },
      { id: 'marker', label: 'Content in index.html', hint: 'Use the exact requested marker text',
        options: [{ value: 'OXSIG Academy persistent', label: 'OXSIG Academy persistent' }, { value: 'Hello temporary', label: 'Hello temporary' }, { value: 'Server starting', label: 'Server starting' }] },
    ],
  },
] as const;

export type DockerSimulationStageId = typeof DOCKER_SIMULATION_STAGES[number]['id'];
export const simulationStageIdSchema = z.enum(['container', 'network', 'storage']);
export const simulatorCommandSchema = z.object({
  stageId: simulationStageIdSchema,
  selections: z.record(z.string().min(1).max(32), z.string().min(1).max(128))
    .refine((items) => Object.keys(items).length <= 3, 'Too many configuration entries'),
}).strict();

export function simulationStage(id: DockerSimulationStageId) {
  return DOCKER_SIMULATION_STAGES.find((item) => item.id === id)!;
}
export function stageIsUnlocked(id: DockerSimulationStageId, completed: ReadonlySet<string>) {
  const index = DOCKER_SIMULATION_STAGES.findIndex((stage) => stage.id === id);
  return index === 0 || (index > 0 && completed.has(DOCKER_SIMULATION_STAGES[index - 1].id));
}
