#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

printf 'Building OxSig Kali lab image...\n'
docker build \
  -t oxsig/kali-web-recon:local \
  "$ROOT_DIR/lab-engine/images/kali-web-recon"

printf 'Building OxSig web-recon target image...\n'
docker build \
  -t oxsig/target-web-recon:local \
  "$ROOT_DIR/lab-engine/targets/web-recon"

printf 'Lab images are ready.\n'
