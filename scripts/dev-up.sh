#!/usr/bin/env bash
set -Eeuo pipefail

BRANCH="refactor/clean-foundation"
PROFILE="${OXSIG_AWS_PROFILE:-oxsig-dev}"
EXPECTED_ACCOUNT="094525993701"

info() {
  printf '\n[oxsig] %s\n' "$*"
}

fail() {
  printf '\n[oxsig] ERROR: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' is not installed or not on PATH."
}

need git
need node
need pnpm
need aws

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this from inside the Oxsig Git repository."
cd "$ROOT"

if [[ ! -f package.json ]]; then
  fail "package.json was not found at the repository root."
fi

# pnpm currently generates an untracked lockfile in this repository. Remove only
# that known generated file so it does not block switching to the canonical branch.
if [[ -f pnpm-lock.yaml ]] && ! git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1; then
  rm -f pnpm-lock.yaml
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  git status --short
  fail "The repository has uncommitted or untracked work. Commit, stash, or remove it before running the startup script."
fi

info "Switching to the latest Oxsig code"
git fetch origin --prune

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git switch "$BRANCH"
else
  git switch --track -c "$BRANCH" "origin/$BRANCH"
fi

git pull --ff-only origin "$BRANCH"

CURRENT_BRANCH="$(git branch --show-current)"
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] || fail "Expected branch '$BRANCH' but Git reports '$CURRENT_BRANCH'."

# Clear only the disposable Next.js build cache. Keep node_modules so pnpm can
# reuse the dependencies already present and download only packages that changed.
info "Clearing Next.js build cache"
rm -rf .next

if [[ ! -f .env.local ]]; then
  fail ".env.local is missing. Oxsig local development requires your existing local environment configuration."
fi

info "Checking dependencies"
if git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
else
  pnpm install --no-frozen-lockfile
fi

info "Checking AWS SSO profile: $PROFILE"
ACCOUNT=""
if ACCOUNT="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text 2>/dev/null)"; then
  info "AWS session is already authenticated"
else
  info "AWS session is expired; opening SSO login"
  aws sso login --profile "$PROFILE"
  ACCOUNT="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"
fi

if [[ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  fail "AWS profile '$PROFILE' resolved to account '$ACCOUNT'. Oxsig must use account '$EXPECTED_ACCOUNT'."
fi

export AWS_PROFILE="$PROFILE"

info "AWS authentication successful: account $ACCOUNT"
info "Starting Oxsig"
printf '[oxsig] Press Ctrl+C to stop the server.\n\n'

exec pnpm dev
