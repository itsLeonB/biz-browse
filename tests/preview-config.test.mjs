import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mapping = {
  preview_id: "pr-7",
  clerk_publishable_key: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  preview: {
    project: "project-a",
    branch: "br-preview",
    database: "directory",
    role: "preview_role",
    worker: "directory-pr-7",
    bucket: "directory-pr-7",
  },
  live: {
    project: "project-a",
    branch: "br-live",
    database: "directory",
    role: "live_role",
    worker: "directory-live",
    bucket: "directory-live",
  },
};

test("preview config targets the assigned Worker and bucket and rejects unsafe mappings", () => {
  const dir = mkdtempSync(join(tmpdir(), "preview-config-"));
  const file = join(dir, "mapping.json");
  const run = (value) => {
    writeFileSync(file, JSON.stringify(value));
    return spawnSync(process.execPath, ["scripts/preview-config.mjs", file, "pr-7"], {
      encoding: "utf8",
    });
  };
  try {
    let result = run(mapping);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config.name, "directory-pr-7");
    assert.deepEqual(config.r2_buckets, [{ binding: "PHOTOS", bucket_name: "directory-pr-7" }]);
    const unpaddedKey = `pk_test_${Buffer.from("auth.example.com$").toString("base64").replace(/=+$/, "")}`;
    result = run({ ...mapping, clerk_publishable_key: unpaddedKey });
    assert.equal(result.status, 0, result.stderr);
    result = run({
      ...mapping,
      preview: { ...mapping.preview, project: "project-b", branch: mapping.live.branch },
      cloudflare_account_id: "a".repeat(32),
    });
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(
      file,
      JSON.stringify(mapping).replace(
        '"preview_id":"pr-7"',
        '"preview_id":"pr-8","preview_id":"pr-7"',
      ),
    );
    result = spawnSync(process.execPath, ["scripts/preview-config.mjs", file, "pr-7"], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    for (const bad of [
      {},
      { ...mapping, cloudflare_account_id: "invalid" },
      { ...mapping, clerk_publishable_key: undefined },
      { ...mapping, clerk_publishable_key: ["sk", "test", "Y2xlcmsuZXhhbXBsZS5jb20k"].join("_") },
      { ...mapping, clerk_publishable_key: "pk_test_not-base64" },
      { ...mapping, clerk_publishable_key: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20=" },
      { ...mapping, preview_id: "pr-8" },
      { ...mapping, preview: { ...mapping.preview, branch: "" } },
      { ...mapping, preview: { ...mapping.preview, branch: "br-live" } },
      { ...mapping, preview: { ...mapping.preview, worker: "directory-live" } },
      { ...mapping, preview: { ...mapping.preview, bucket: "directory-live" } },
      { ...mapping, preview: { ...mapping.preview, role: "live_role" } },
      { ...mapping, preview: { ...mapping.preview, password: "secret" } },
    ]) {
      result = run(bad);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.doesNotMatch(result.stderr, /secret/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
