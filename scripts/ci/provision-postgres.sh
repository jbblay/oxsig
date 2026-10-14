#!/usr/bin/env bash
# Provision a disposable PostgreSQL 16 server for CI schema verification.
#
# Works on the AWS CodeBuild standard images: installs PostgreSQL from the
# image's package manager (apt on Ubuntu, dnf on Amazon Linux) and falls back to
# a host-networked Docker container only when no package manager is available.
#
# Connection contract (must match OXSIG_CI_DATABASE_URL in buildspec.yml):
#   postgresql://oxsig_ci:oxsig_ci@127.0.0.1:5432/oxsig_ci
set -euo pipefail

DB_NAME="oxsig_ci"
DB_USER="oxsig_ci"
DB_PASSWORD="oxsig_ci"
PORT="5432"
IMAGE="public.ecr.aws/docker/library/postgres:16"

log() { printf '[provision-postgres] %s\n' "$*"; }

wait_ready() {
  # Authenticated TCP check with the same driver the CI tools use.
  OXSIG_CI_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}" \
    node "$(dirname "$0")/wait-for-postgres.mjs"
}

create_role_and_db() {
  # Runs as the postgres OS user over the local socket. $1: optional psql
  # connection flags (e.g. "-h /tmp -p 5432").
  local connection="${1:-}"
  local init_sql="/tmp/oxsig-ci-init.sql"
  cat > "$init_sql" <<SQL
CREATE ROLE ${DB_USER} LOGIN SUPERUSER PASSWORD '${DB_PASSWORD}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
SQL
  chmod 644 "$init_sql"
  su postgres -s /bin/bash -c "psql ${connection} -v ON_ERROR_STOP=1 -f ${init_sql} postgres"
}

if command -v apt-get >/dev/null 2>&1; then
  log "Installing PostgreSQL via apt"
  export DEBIAN_FRONTEND=noninteractive
  # Third-party apt sources on CI images sometimes have stale keys; the
  # distribution repositories are what matter here.
  apt-get update -qq || log "apt-get update reported errors; continuing with available indexes"
  apt-get install -y -qq --no-install-recommends postgresql postgresql-contrib >/dev/null
  CLUSTER_VERSION="$(ls /usr/lib/postgresql | sort -V | tail -1)"
  if ! pg_lsclusters -h 2>/dev/null | awk '{print $1" "$2}' | grep -q "^${CLUSTER_VERSION} main$"; then
    pg_createcluster "$CLUSTER_VERSION" main >/dev/null
  fi
  pg_ctlcluster "$CLUSTER_VERSION" main start || service postgresql start
  log "PostgreSQL ${CLUSTER_VERSION} started"
  create_role_and_db
  wait_ready
  exit 0
fi

if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
  PKG="$(command -v dnf || command -v yum)"
  log "Installing PostgreSQL via $(basename "$PKG")"
  "$PKG" install -y -q postgresql16-server postgresql16 \
    || "$PKG" install -y -q postgresql15-server postgresql15 \
    || "$PKG" install -y -q postgresql-server postgresql
  DATA_DIR="/tmp/oxsig-ci-pgdata"
  INITDB="$(command -v initdb || ls /usr/bin/initdb /usr/pgsql-*/bin/initdb 2>/dev/null | head -1)"
  PG_CTL="$(command -v pg_ctl || ls /usr/bin/pg_ctl /usr/pgsql-*/bin/pg_ctl 2>/dev/null | head -1)"
  id postgres >/dev/null 2>&1 || useradd -r -m postgres
  rm -rf "$DATA_DIR" && mkdir -p "$DATA_DIR" && chown postgres "$DATA_DIR"
  su postgres -s /bin/bash -c "$INITDB -D $DATA_DIR -A trust -U postgres >/dev/null"
  su postgres -s /bin/bash -c "$PG_CTL -D $DATA_DIR -o '-p ${PORT} -k /tmp' -l /tmp/oxsig-ci-postgres.log -w start"
  create_role_and_db "-h /tmp -p ${PORT}"
  wait_ready
  exit 0
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  # Fallback only: on CodeBuild the published port of a bridge-networked
  # container was not reachable over TCP, so share the build's network instead.
  log "Using Docker image ${IMAGE} (host network)"
  docker run -d --name oxsig-ci-postgres --network host \
    -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
    -e PGPORT="$PORT" "$IMAGE" >/dev/null
  wait_ready
  exit 0
fi

log "No supported way to provision PostgreSQL (need Docker, apt-get or dnf)"
exit 1
