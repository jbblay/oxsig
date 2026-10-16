import { DOCKER_MISSIONS, type DockerMissionId, type MissionDifficulty } from './docker-missions';

const prompts: Record<DockerMissionId, Record<MissionDifficulty, readonly string[]>> = {
  deploy: {
    beginner: ['Run docker info to check that Docker can respond.', 'Use docker ps -a to look for oxsig-academy-web. A stopped container cannot serve traffic.', 'The assignment needs host port 18080 forwarded to port 80 in the container. Test the host endpoint after publishing it.'],
    intermediate: ['Establish whether this is a daemon, container, or networking problem.', 'Compare the published host port with the service port inside the container.', 'Prove reachability with an HTTP request, not just a running status.'],
    advanced: ['What evidence would distinguish process health from service reachability?', 'Which layer owns the failing endpoint: host, mapping, or application?', 'What is the smallest change you can validate independently?'],
  },
  repair: {
    beginner: ['Inspect docker ps to see which port is published.', 'Use docker port oxsig-academy-web. Compare its host port with 18080 in the assignment.', 'Docker port mappings are set when a container is created. Recreate only the Academy container with the intended mapping.'],
    intermediate: ['Separate application health from endpoint configuration.', 'Inspect the container mapping and logs before changing anything.', 'Change only the reserved Academy container, then repeat the original HTTP check.'],
    advanced: ['What observation falsifies your current root-cause hypothesis?', 'Can you isolate the broken boundary without replacing unrelated resources?', 'How will you demonstrate recovery and limit the change scope?'],
  },
  persist: {
    beginner: ['A named volume survives container replacement. Inspect docker volume ls.', 'Mount oxsig_academy_data at /usr/share/nginx/html. A new volume may not contain a working index page.', 'Write the required marker into index.html in the mounted directory, then check the HTTP response.'],
    intermediate: ['Determine which filesystem owns the content after replacement.', 'Inspect the named volume and its mount destination.', 'Verify both the required marker and HTTP response after recreating the service.'],
    advanced: ['Which failure would expose hidden coupling between compute and storage?', 'What evidence distinguishes durable content from a container-layer file?', 'Can a replacement serve the required content with no manual filesystem rescue?'],
  },
};

export function dockerCoaching(missionId: DockerMissionId, level: MissionDifficulty) {
  const mission = DOCKER_MISSIONS.find(item => item.id === missionId)!;
  const diagnostics = missionId === 'deploy' ? ['docker info', 'docker ps -a']
    : missionId === 'repair' ? ['docker ps', 'docker port oxsig-academy-web', 'docker logs oxsig-academy-web']
      : ['docker volume ls', 'docker inspect oxsig-academy-web'];
  return {
    prompts: prompts[missionId][level],
    commands: level === 'advanced' ? [] : diagnostics,
    workedCommands: mission.commands,
    approach: level === 'beginner' ? 'Inspect → change → check. Ask for a hint whenever you need one.'
      : level === 'intermediate' ? 'Form a hypothesis, inspect the evidence, then test one change.'
        : 'Meet the acceptance criteria and justify your diagnosis with evidence.',
  };
}

export function coachingHint(missionId: DockerMissionId, level: MissionDifficulty, hintsUsed: number) {
  return dockerCoaching(missionId, level).prompts[Math.max(0, Math.min(hintsUsed - 1, 2))];
}

export function commandPurpose(command: string): string {
  if (command === 'docker info') return 'Check that Docker is running and accessible.';
  if (command.startsWith('docker ps')) return 'List containers and their published ports. -a includes stopped containers.';
  if (command.startsWith('docker port')) return 'Compare the container port with the host port you can reach.';
  if (command.startsWith('docker logs')) return 'Read the application output before changing the container.';
  if (command === 'docker volume ls') return 'List storage volumes that exist independently of containers.';
  if (command.startsWith('docker inspect')) return 'Inspect the container configuration, including mounts and networking.';
  if (command.startsWith('docker rm')) return 'Remove the reserved Academy container. This stops its service; keep unrelated containers.';
  if (command.startsWith('docker run')) return 'Create the Academy service. -p maps host:container ports; -v mounts persistent storage.';
  if (command.startsWith('curl')) return 'Test the actual web response at the published host endpoint.';
  return 'Read this example and compare it with the assignment before running it.';
}
