import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sha = "a".repeat(40);
const baseSha = "b".repeat(40);
const repository = { id: 123, full_name: "owner/repo", default_branch: "main" };
const pr = {
  number: 7,
  state: "open",
  author_association: "MEMBER",
  user: { id: 42 },
  base: { ref: "main", repo: repository },
  head: { sha, repo: repository },
};
const event = { action: "synchronize", number: 7, repository, pull_request: pr };
const run = {
  id: 99,
  run_attempt: 1,
  event: "pull_request_target",
  path: ".github/workflows/preview-build.yml",
  repository,
  head_sha: baseSha,
};
const resource = (suffix) => ({
  project: "project",
  branch: suffix,
  database: "db",
  role: suffix,
  worker: `worker-${suffix}`,
  bucket: `bucket-${suffix}`,
});

test("identity output binds the live trusted PR, mapping, workflow and run; mismatches fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "preview-identity-"));
  try {
    const mappings = join(dir, "mappings");
    mkdirSync(mappings);
    writeFileSync(
      join(mappings, "pr-7.json"),
      JSON.stringify({
        preview_id: "pr-7",
        clerk_publishable_key: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
        preview: resource("preview"),
        live: resource("live"),
      }),
    );
    const eventFile = join(dir, "event.json");
    writeFileSync(eventFile, JSON.stringify(event));
    const preload = join(dir, "mock.mjs");
    writeFileSync(
      preload,
      `globalThis.fetch = async (url) => { const data = JSON.parse(process.env.FIXTURES); const path = new URL(url).pathname; const result = data[path]; return { ok: result !== undefined, json: async () => result }; };`,
    );
    const fixtures = {
      "/repos/owner/repo": repository,
      "/repos/owner/repo/pulls/7": pr,
      "/repos/owner/repo/actions/runs/99/attempts/1": run,
    };
    const execute = (data, extra = {}) =>
      spawnSync(process.execPath, ["--import", preload, resolve("scripts/preview-identity.mjs")], {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          GITHUB_EVENT_PATH: eventFile,
          GITHUB_EVENT_NAME: "pull_request_target",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "99",
          GITHUB_RUN_ATTEMPT: "1",
          GITHUB_SHA: baseSha,
          GITHUB_WORKFLOW_SHA: baseSha,
          GITHUB_WORKFLOW_REF: "owner/repo/.github/workflows/preview-build.yml@refs/heads/main",
          GITHUB_TOKEN: "dummy",
          PREVIEW_MAPPINGS: mappings,
          FIXTURES: JSON.stringify(data),
          ...extra,
        },
      });
    let result = execute(fixtures);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      pr: 7,
      head_sha: sha,
      source_repository: "owner/repo",
      source_repository_id: 123,
      workflow_ref: "owner/repo/.github/workflows/preview-build.yml@refs/heads/main",
      workflow_sha: baseSha,
      run_id: "99",
      run_attempt: "1",
      mapping_sha256: createHash("sha256")
        .update(readFileSync(join(mappings, "pr-7.json")))
        .digest("hex"),
    });
    for (const changed of [
      { ...pr, head: { ...pr.head, sha: "c".repeat(40) } },
      { ...pr, head: { ...pr.head, repo: { ...repository, id: 999 } } },
      { ...pr, author_association: "CONTRIBUTOR" },
      { ...pr, user: { id: 99 } },
      { ...pr, state: "closed" },
    ]) {
      result = execute({ ...fixtures, "/repos/owner/repo/pulls/7": changed });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
    }
    for (const changed of [
      { ...run, id: 100 },
      { ...run, run_attempt: 2 },
      { ...run, path: ".github/workflows/other.yml" },
      { ...run, head_sha: sha },
    ]) {
      result = execute({ ...fixtures, "/repos/owner/repo/actions/runs/99/attempts/1": changed });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
    }
    assert.notEqual(
      execute(fixtures, {
        GITHUB_WORKFLOW_REF: "owner/repo/.github/workflows/preview-build.yml@refs/heads/feature",
      }).status,
      0,
    );
    assert.notEqual(execute({}).status, 0);
    rmSync(join(mappings, "pr-7.json"));
    assert.notEqual(execute(fixtures).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
