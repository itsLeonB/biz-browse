import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("packages Worker modules and client assets without build metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "preview-package-"));
  const build = join(root, "dist");
  const artifact = join(root, "artifact");
  try {
    mkdirSync(join(build, "server", "assets"), { recursive: true });
    mkdirSync(join(build, "client", "assets"), { recursive: true });
    writeFileSync(join(build, "server", "index.js"), 'import "./assets/chunk.js";');
    writeFileSync(join(build, "server", "assets", "chunk.js"), "export const value = 1;");
    writeFileSync(join(build, "server", "index.js.map"), "private source");
    writeFileSync(join(build, "server", "wrangler.json"), "private config");
    writeFileSync(join(build, "client", ".assetsignore"), "*");
    writeFileSync(join(build, "client", "assets", "app.js"), "client code");
    writeFileSync(join(build, "client", "assets", "app.js.map"), "private source");
    const result = spawnSync(process.execPath, ["scripts/preview-package.mjs", build, artifact], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const validation = spawnSync(
      process.execPath,
      ["scripts/preview-artifact.mjs", artifact, "--validate-only"],
      { encoding: "utf8" },
    );
    assert.equal(validation.status, 0, validation.stderr);
    assert.deepEqual(
      JSON.parse(validation.stdout).map((file) => file.path),
      ["client/assets/app.js", "server/assets/chunk.js", "server/index.js"],
    );
    assert.equal(
      readFileSync(join(artifact, "server", "assets", "chunk.js"), "utf8"),
      "export const value = 1;",
    );
    assert.notEqual(
      spawnSync(process.execPath, ["scripts/preview-package.mjs", build, artifact]).status,
      0,
    );
    symlinkSync(join(build, "server", "index.js"), join(build, "client", "assets", "link"));
    const unsafe = join(root, "unsafe");
    assert.notEqual(
      spawnSync(process.execPath, ["scripts/preview-package.mjs", build, unsafe]).status,
      0,
    );
    assert.equal(existsSync(unsafe), false);
    rmSync(join(build, "client", "assets", "link"));
    const largeMap = join(build, "server", "large.js.map");
    writeFileSync(largeMap, "");
    truncateSync(largeMap, 51 * 1024 * 1024);
    assert.notEqual(
      spawnSync(process.execPath, ["scripts/preview-package.mjs", build, unsafe]).status,
      0,
    );
    assert.equal(existsSync(unsafe), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
