#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVIRONMENT="${1:-${DEPLOY_ENV:-staging}}"
DRY_RUN="false"

if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

case "$ENVIRONMENT" in
  staging|production)
    ;;
  *)
    echo "[deploy] Unsupported environment '$ENVIRONMENT'. Use 'staging' or 'production'." >&2
    exit 1
    ;;
 esac

ENV_FILE="$ROOT_DIR/config/deploy/${ENVIRONMENT}.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

export CSOUND_ENVIRONMENT="$ENVIRONMENT"

if [[ "${CSOUND_TELEMETRY_ENDPOINT:-}" == "" ]]; then
  echo "[deploy] Warning: CSOUND_TELEMETRY_ENDPOINT is not set. Telemetry events will be discarded." >&2
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[deploy] Running in dry-run mode. Build steps will execute but deployment will be skipped."
fi

pushd "$ROOT_DIR" > /dev/null

echo "[deploy] Installing dependencies"
npm install --silent

echo "[deploy] Bundling application for $ENVIRONMENT"
NODE_ENV="$ENVIRONMENT" npm run build

echo "[deploy] Optimizing assets"
NODE_ENV="$ENVIRONMENT" npm run optimize:assets

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[deploy] Dry run complete. Skipping platform deployment."
  popd > /dev/null
  exit 0
fi

if [[ -z "${NETLIFY_SITE_ID:-}" ]]; then
  echo "[deploy] NETLIFY_SITE_ID is required to push the bundle." >&2
  popd > /dev/null
  exit 1
fi

if [[ -z "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  echo "[deploy] NETLIFY_AUTH_TOKEN is required to authenticate with Netlify." >&2
  popd > /dev/null
  exit 1
fi

DEPLOY_DIR="$ROOT_DIR/dist"
if [[ ! -d "$DEPLOY_DIR" ]]; then
  echo "[deploy] Build output not found at $DEPLOY_DIR" >&2
  popd > /dev/null
  exit 1
fi

MESSAGE="Deploy ${ENVIRONMENT} $(date -Iseconds)"
ALIAS="${NETLIFY_DEPLOY_ALIAS:-$ENVIRONMENT}"

if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "[deploy] Publishing production deployment via Netlify"
  npx netlify deploy \
    --dir="$DEPLOY_DIR" \
    --site="$NETLIFY_SITE_ID" \
    --auth="$NETLIFY_AUTH_TOKEN" \
    --prod \
    --message="$MESSAGE"
else
  echo "[deploy] Publishing staging deployment via Netlify (alias: $ALIAS)"
  npx netlify deploy \
    --dir="$DEPLOY_DIR" \
    --site="$NETLIFY_SITE_ID" \
    --auth="$NETLIFY_AUTH_TOKEN" \
    --alias="$ALIAS" \
    --message="$MESSAGE"
fi

popd > /dev/null

echo "[deploy] Deployment finished for $ENVIRONMENT"
