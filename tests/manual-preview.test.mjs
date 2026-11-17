import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("manual preview uses the approved mapping and never prints provider secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "manual-preview-"));
  try {
    const bin = join(dir, "bin"),
      artifact = join(dir, "artifact"),
      log = join(dir, "log");
    mkdirSync(bin);
    mkdirSync(join(artifact, "server"), { recursive: true });
    mkdirSync(join(artifact, "client"));
    writeFileSync(join(artifact, "server/index.js"), "export default {};");
    writeFileSync(join(artifact, "client/app.js"), "ok");
    const mapping = {
      preview_id: "pr-7",
      clerk_publishable_key: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
      preview: {
        project: "project",
        branch: "preview",
        database: "db",
        role: "preview",
        worker: "worker-pr-7",
        bucket: "bucket-pr-7",
      },
      live: {
        project: "project",
        branch: "live",
        database: "db",
        role: "live",
        worker: "worker-live",
        bucket: "bucket-live",
      },
    };
    const envelope = { cloudflare_account_id: "a".repeat(32), mapping };
    const fake = join(dir, "fake.mjs");
    writeFileSync(
      fake,
      `globalThis.fetch = async (url) => { const u = new URL(url); if (u.pathname !== '/api/v2/projects/project/connection_uri' || u.searchParams.get('branch_id') !== 'preview' || u.searchParams.get('database_name') !== 'db' || u.searchParams.get('role_name') !== 'preview') throw Error('wrong target'); return Response.json({ uri: process.env.FAKE_URI || 'postgresql://preview:fake-password@host/db' }, { status: process.env.FAIL_NEON ? 500 : 200 }); };`,
    );
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\nif [ "$1" = rev-parse ]; then printf '%s\\n' '${"b".repeat(40)}'; elif [ "$1" = ls-tree ]; then printf '100644 blob ${"a".repeat(40)}\\t.github/manual-preview-mappings/pr-7.json\\n'; if [ -f '${join(dir, "other")}' ]; then printf '100644 blob ${"a".repeat(40)}\\t.github/preview-mappings/pr-8.json\\n'; fi; else case "$2" in *pr-8.json) /bin/cat '${join(dir, "other")}' ;; *) /bin/cat '${join(dir, "mapping")}' ;; esac; fi\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "wrangler"),
      `#!/bin/sh\necho "$*" >> '${log}'\nfor arg in "$@"; do if [ "$last" = '--config' ]; then cp "$arg" '${join(dir, "config")}'; fi; last="$arg"; done\nif [ "$1" = secret ]; then IFS= read -r secret; [ "$secret" = 'postgresql://preview:fake-password@host/db' ] || exit 1; fi\necho fake-password\n`,
      { mode: 0o755 },
    );
    const run = (value, extra = {}, commit = "b".repeat(40)) => {
      writeFileSync(join(dir, "mapping"), JSON.stringify(value));
      return spawnSync(
        process.execPath,
        ["--import", fake, resolve("scripts/manual-preview.mjs"), "pr-7", commit, artifact],
        {
          encoding: "utf8",
          env: {
            PATH: `${bin}:/usr/bin:/bin`,
            HOME: dir,
            TMPDIR: dir,
            NEON_API_KEY: "fake-neon",
            CLOUDFLARE_API_TOKEN: "fake-cloudflare",
            ...extra,
          },
        },
      );
    };
    let result = run(envelope);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /fake-password|fake-neon|fake-cloudflare/);
    const config = JSON.parse(readFileSync(join(dir, "config"), "utf8"));
    assert.equal(config.name, "worker-pr-7");
    assert.equal(config.account_id, "a".repeat(32));
    assert.equal(config.r2_buckets[0].bucket_name, "bucket-pr-7");
    assert.match(readFileSync(log, "utf8"), /secret put DATABASE_URL.*--name worker-pr-7/);
    assert.match(readFileSync(log, "utf8"), /deploy.*--name worker-pr-7/);
    rmSync(log);
    const other = {
      ...mapping,
      preview_id: "pr-8",
      preview: {
        ...mapping.preview,
        project: "other",
        worker: "worker-pr-8",
        bucket: "bucket-pr-8",
      },
    };
    for (const conflict of [
      { ...other, preview: { ...other.preview, project: mapping.preview.project } },
      { ...other, live: { ...other.live, branch: mapping.preview.branch } },
      {
        ...other,
        preview: { ...other.preview, project: mapping.live.project, branch: mapping.live.branch },
      },
    ]) {
      writeFileSync(join(dir, "other"), JSON.stringify(conflict));
      result = run(envelope);
      assert.notEqual(result.status, 0);
      assert.throws(() => readFileSync(log));
    }
    writeFileSync(join(dir, "other"), JSON.stringify(other));
    result = run(envelope);
    assert.equal(result.status, 0, result.stderr);
    rmSync(log);
    rmSync(join(dir, "other"));
    for (const value of [
      {
        ...envelope,
        mapping: { ...mapping, preview: { ...mapping.preview, bucket: mapping.live.bucket } },
      },
      {
        ...envelope,
        mapping: { ...mapping, preview: { ...mapping.preview, worker: "biz-browse" } },
      },
      { ...envelope, cloudflare_account_id: "invalid" },
    ]) {
      result = run(value);
      assert.notEqual(result.status, 0);
      assert.throws(() => readFileSync(log));
    }
    result = run(envelope, {}, "c".repeat(40));
    assert.notEqual(result.status, 0);
    assert.throws(() => readFileSync(log));
    for (const extra of [
      { FAIL_NEON: "1" },
      { FAKE_URI: "postgresql://live:fake-password@host/db" },
    ]) {
      result = run(envelope, extra);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout + result.stderr, /fake-password|fake-neon|fake-cloudflare/);
      assert.throws(() => readFileSync(log));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
