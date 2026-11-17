import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("preview artifact gate accepts bounded build data and rejects unsafe files", () => {
  const root = mkdtempSync(join(tmpdir(), "preview-artifact-"));
  const build = join(root, "build");
  mkdirSync(join(build, "server"), { recursive: true });
  mkdirSync(join(build, "client", "assets"), { recursive: true });
  writeFileSync(join(build, "server", "index.js"), "export default {};");
  writeFileSync(join(build, "client", "assets", "app.js"), "ok");
  const run = () =>
    spawnSync(process.execPath, ["scripts/preview-artifact.mjs", build, "--validate-only"], {
      encoding: "utf8",
    });
  try {
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(
      JSON.parse(valid.stdout).map((file) => file.path),
      ["client/assets/app.js", "server/index.js"],
    );
    rmSync(join(build, "server", "index.js"));
    assert.notEqual(run().status, 0);
    writeFileSync(join(build, "server", "index.js"), "export default {};");
    symlinkSync("/etc/passwd", join(build, "client", "assets", "link"));
    assert.notEqual(run().status, 0);
    rmSync(join(build, "client", "assets", "link"));
    writeFileSync(join(build, "server", "wrangler.json"), "{}");
    assert.notEqual(run().status, 0);
    rmSync(join(build, "server", "wrangler.json"));
    writeFileSync(join(build, "client", "assets", "large.js"), Buffer.alloc(11 * 1024 * 1024));
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
