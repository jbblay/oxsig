# OxSig Practical Labs MVP

This directory contains the first Docker-based OxSig practical lab engine.

## Scope

The MVP provides:

- one disposable Kali Linux container per learner session;
- one intentionally insecure training target;
- a private `--internal` Docker network per session;
- browser-driven terminal I/O through the existing authenticated Socket.IO server;
- start, reset, destroy, and automatic expiry;
- CPU, memory, PID, filesystem, and Linux capability restrictions;
- lifecycle audit events in the existing `audit_logs` table;
- no terminal command/output capture by default.

The first exercise is `web-recon-01`, a safe reconnaissance and information-disclosure lab.

## Build the lab images

```bash
bash lab-engine/scripts/build-images.sh
```

This creates:

- `oxsig/kali-web-recon:local`
- `oxsig/target-web-recon:local`

## Enable labs

Labs are disabled unless explicitly enabled.

```bash
export LABS_ENABLED=true
export LAB_TTL_MINUTES=30
npm run dev
```

The normal OxSig JWT environment must also be configured. In particular, the lab socket verifier requires the same `JWT_PUBLIC_KEY` used by the application authentication system.

Optional image overrides:

```bash
export LAB_KALI_IMAGE=oxsig/kali-web-recon:local
export LAB_TARGET_IMAGE=oxsig/target-web-recon:local
```

## Security model

Learner containers are launched with:

- no published host ports;
- no host networking;
- no Docker socket mount;
- no privileged mode;
- `--cap-drop ALL`;
- `no-new-privileges`;
- read-only root filesystems;
- limited tmpfs mounts;
- CPU, memory, and PID limits;
- a random private internal bridge network;
- random container/network names;
- automatic TTL destruction.

The Kali and target containers share only their per-session internal bridge. Docker blocks routing from an internal network to other Docker/external networks, so the learner cannot use that network for normal Internet or cloud-metadata access and cannot reach another learner's separately created lab network.

### Host gateway boundary

Docker internal networks still permit communication with the bridge gateway IP. Therefore `--internal` by itself must **not** be treated as a complete host firewall.

Production lab workers must additionally satisfy both of these requirements:

1. Run labs on dedicated worker hosts/nodes that do not expose OxSig application, database, storage, Docker API, SSH administration, cloud metadata proxy, or other sensitive services on lab bridge interfaces.
2. Apply host firewall policy that rejects learner-network traffic destined for the worker host/gateway while still permitting container-to-container traffic inside each lab network.

The target has no published host port and remains reachable only from its lab network unless an operator deliberately changes the Docker configuration.

## Important production boundary

For the MVP, the OxSig Node server invokes the local Docker CLI. That is suitable for a dedicated development/lab worker, but the main public OxSig application should **not** receive unrestricted Docker-daemon authority in production.

The production design should split this into a separate Lab Orchestrator/Worker service on dedicated infrastructure, authenticated by a narrow internal API. The public web application should request lab lifecycle operations from that service rather than directly controlling Docker.

Do not mount `/var/run/docker.sock` into any learner container. Do not use `--privileged`.

## Exercise

Inside the Kali terminal, the target is available as:

```text
target:8080
```

The learner should enumerate the service, inspect HTTP metadata and `robots.txt`, then identify the intentionally exposed debug endpoint.

## Auditing

The server records lifecycle events only:

- `lab.session.start`
- `lab.session.reset`
- `lab.session.stop`
- `lab.session.expire`

Terminal commands and output are intentionally not stored by this MVP.
