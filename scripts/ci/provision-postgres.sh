#!/usr/bin/env bash
# Provision a disposable PostgreSQL 16 server for CI schema verification.
#
# Works on the AWS CodeBuild standard images without requiring privileged
# mode: uses Docker when a daemon is reachable, otherwise installs PostgreSQL
# from the image's package manager (apt on Ubuntu images, dnf on Amazon Linux).
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
  for _ in $(seq 1 60); do
    if PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1; then
      log "PostgreSQL is ready"
      return 0
    fi
    sleep 1
  done
  log "PostgreSQL did not become ready in time"
  return 1
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

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  log "Using Docker image ${IMAGE}"
  docker run -d --name oxsig-ci-postgres -p "${PORT}:5432" \
    -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
    "$IMAGE" >/dev/null
  if ! command -v psql >/dev/null 2>&1; then
    # Readiness probe through the container when no host client exists.
    for _ in $(seq 1 60); do
      docker exec oxsig-ci-postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 && { log "PostgreSQL is ready"; exit 0; }
      sleep 1
    done
    log "PostgreSQL container did not become ready"; exit 1
  fi
  wait_ready
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  log "Installing PostgreSQL via apt"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq postgresql postgresql-contrib >/dev/null
  CLUSTER_VERSION="$(ls /etc/postgresql | sort -V | tail -1)"
  pg_ctlcluster "$CLUSTER_VERSION" main start
  create_role_and_db
  wait_ready
  exit 0
fi

if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
  PKG="$(command -v dnf || command -v yum)"
  log "Installing PostgreSQL via $(basename "$PKG")"
  "$PKG" install -y -q postgresql16-server postgresql16 >/dev/null 2>&1 \
    || "$PKG" install -y -q postgresql15-server postgresql15 >/dev/null 2>&1 \
    || "$PKG" install -y -q postgresql-server postgresql >/dev/null
  DATA_DIR="/tmp/oxsig-ci-pgdata"
  INITDB="$(command -v initdb || ls /usr/bin/initdb /usr/pgsql-*/bin/initdb 2>/dev/null | head -1)"
  PG_CTL="$(command -v pg_ctl || ls /usr/bin/pg_ctl /usr/pgsql-*/bin/pg_ctl 2>/dev/null | head -1)"
  id postgres >/dev/null 2>&1 || useradd -r postgres
  rm -rf "$DATA_DIR" && mkdir -p "$DATA_DIR" && chown postgres "$DATA_DIR"
  su postgres -s /bin/bash -c "$INITDB -D $DATA_DIR -A trust -U postgres >/dev/null"
  su postgres -s /bin/bash -c "$PG_CTL -D $DATA_DIR -o '-p ${PORT} -k /tmp' -l /tmp/oxsig-ci-postgres.log -w start"
  create_role_and_db "-h /tmp -p ${PORT}"
  wait_ready
  exit 0
fi

log "No supported way to provision PostgreSQL (need Docker, apt-get or dnf)"
exit 1
