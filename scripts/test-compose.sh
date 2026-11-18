#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
project="biz-test-$(basename "$tmp" | tr '[:upper:].' '[:lower:]-')"
cleanup() {
  docker compose -p "$project" -f compose.test.yaml down --volumes --remove-orphans >/dev/null || true
  rm -f "$tmp/dev.vars"
  rmdir "$tmp"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
for key in CLERK_SECRET_KEY VITE_CLERK_PUBLISHABLE_KEY; do
  if ! grep -Eq "^[[:space:]]*$key=[^[:space:]]+" "${DEV_VARS_FILE:-.dev.vars.example}"; then
    echo "Missing $key in DEV_VARS_FILE" >&2
    exit 1
  fi
done
awk '!/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL[[:space:]]*=/' "${DEV_VARS_FILE:-.dev.vars.example}" > "$tmp/dev.vars"
printf '\nDATABASE_URL=postgres://directory_test:local_test_only@db:5432/directory_test\n' >> "$tmp/dev.vars"
export DEV_VARS_FILE="$tmp/dev.vars"
docker compose -p "$project" -f compose.test.yaml up --build -d --wait app
docker compose -p "$project" -f compose.test.yaml run --build --rm --no-deps test
