#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
if [ -z "${ENV_FILE:-}" ]; then
  ENV_FILE=.env
  [ -f "$ENV_FILE" ] || ENV_FILE=.env.example
fi
if [ -z "${DEV_VARS_FILE:-}" ]; then
  DEV_VARS_FILE=./.dev.vars
  [ -f "$DEV_VARS_FILE" ] || DEV_VARS_FILE=./.dev.vars.example
fi
export ENV_FILE DEV_VARS_FILE
tmp=$(mktemp -d)
project="biz-test-$(basename "$tmp" | tr '[:upper:].' '[:lower:]-')"
cleanup() {
  status=$?
  trap - EXIT
  docker compose -p "$project" -f compose.test.yaml down --volumes --remove-orphans >/dev/null || status=1
  rm -f "$tmp/dev.vars" "$tmp/ports.yaml" || status=1
  rmdir "$tmp" || status=1
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
for key in CLERK_SECRET_KEY VITE_CLERK_PUBLISHABLE_KEY; do
  if ! grep -Eq "^[[:space:]]*$key=[^[:space:]]+" "$DEV_VARS_FILE"; then
    echo "Missing $key in DEV_VARS_FILE" >&2
    exit 1
  fi
done
awk '!/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL[[:space:]]*=/' "$DEV_VARS_FILE" > "$tmp/dev.vars"
printf '\nDATABASE_URL=postgres://directory_test:local_test_only@db:5432/directory_test\n' >> "$tmp/dev.vars"
export DEV_VARS_FILE="$tmp/dev.vars"
if [ "${1:-}" = "--browser-public" ]; then
  printf 'services:\n  app:\n    ports:\n      - "127.0.0.1::3107"\n' > "$tmp/ports.yaml"
  docker compose -p "$project" -f compose.test.yaml -f "$tmp/ports.yaml" up --build -d --wait app
  port=$(docker compose -p "$project" -f compose.test.yaml -f "$tmp/ports.yaml" port app 3107)
  TEST_BASE_URL="http://$port" npm run test:browser -- --project=public
else
  docker compose -p "$project" -f compose.test.yaml up --build -d --wait app
  docker compose -p "$project" -f compose.test.yaml run --build --rm --no-deps test
fi
