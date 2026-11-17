#!/usr/bin/env bash
set -euo pipefail

source_dir=$1
output_dir=$2
config_file=$3
key_file=$4

# Only these non-secret build values cross the container boundary.
config=$(base64 -w 0 < "$config_file")
key=$(< "$key_file")
docker run --rm --log-driver none --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  --read-only --tmpfs /tmp:rw,exec,nosuid,nodev,size=4g --pids-limit 512 --memory 6g \
  --mount "type=bind,src=$source_dir,dst=/source,readonly" \
  --mount "type=bind,src=$output_dir,dst=/output" \
  -e HOME=/tmp/home -e "BUILD_CONFIG=$config" -e "VITE_CLERK_PUBLISHABLE_KEY=$key" \
  node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 \
  sh -eu -c '
    mkdir -p "$HOME" /tmp/app
    cp -a /source/. /tmp/app/
    printf %s "$BUILD_CONFIG" | base64 -d > /tmp/preview-wrangler.json
    unset BUILD_CONFIG
    export PREVIEW_WRANGLER_CONFIG=/tmp/preview-wrangler.json
    cd /tmp/app
    npm ci
    npm run build
    cp -a dist/. /output/
  '
