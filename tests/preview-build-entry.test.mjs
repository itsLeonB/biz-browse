import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = { full_name: "owner/repo", default_branch: "main" };
const event = {
  action: "synchronize",
  number: 7,
  repository,
  pull_request: {
    number: 7,
    state: "open",
    author_association: "MEMBER",
    base: { ref: "main", repo: repository },
    head: { sha: "a".repeat(40), repo: repository },
  },
};
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

test("preview build gate accepts only mapped trusted same-repository PRs", () => {
  const dir = mkdtempSync(join(tmpdir(), "preview-gate-"));
  const eventFile = join(dir, "event.json");
  const mappings = join(dir, "mappings");
  mkdirSync(mappings);
  const file = join(mappings, "pr-7.json");
  const keyFile = join(dir, "key");
  const run = (input) => {
    writeFileSync(eventFile, JSON.stringify(input));
    return spawnSync(
      process.execPath,
      ["scripts/preview-build-entry.mjs", eventFile, mappings, "owner/repo", keyFile],
      { encoding: "utf8" },
    );
  };
  try {
    writeFileSync(file, JSON.stringify(mapping));
    let result = run(event);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(readFileSync(keyFile, "utf8"), mapping.clerk_publishable_key);
    assert.equal(config.name, "worker-pr-7");
    assert.deepEqual(config.r2_buckets, [{ binding: "PHOTOS", bucket_name: "bucket-pr-7" }]);
    for (const bad of [
      { ...event, pull_request: { ...event.pull_request, author_association: "CONTRIBUTOR" } },
      {
        ...event,
        pull_request: {
          ...event.pull_request,
          head: { ...event.pull_request.head, repo: { full_name: "fork/repo" } },
        },
      },
      {
        ...event,
        pull_request: { ...event.pull_request, base: { ref: "feature", repo: repository } },
      },
      { ...event, number: "../7" },
    ]) {
      result = run(bad);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
    }
    writeFileSync(keyFile, "stale");
    writeFileSync(file, JSON.stringify({ ...mapping, clerk_publishable_key: "sk_test_secret" }));
    assert.notEqual(run(event).status, 0);
    assert.throws(() => readFileSync(keyFile));
    writeFileSync(file, "{}");
    assert.notEqual(run(event).status, 0);
    rmSync(file);
    assert.notEqual(run(event).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
