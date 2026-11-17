import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const realContainer = process.env.PREVIEW_DISPOSABLE_DOCKER_TEST === "1";
const ordinaryContainer = process.env.PREVIEW_CONTAINER_DOCKER_TEST === "1";
import { spawnSync } from "node:child_process";

test("container build passes only source, output and public build values to Docker", () => {
  const root = mkdtempSync(join(tmpdir(), "preview-container-"));
  try {
    const bin = join(root, "bin");
    const source = join(root, "source");
    const output = join(root, "output");
    const capture = join(root, "args");
    for (const dir of [bin, source, output]) mkdirSync(dir);
    writeFileSync(join(root, "config"), '{"name":"preview"}');
    writeFileSync(join(root, "key"), "pk_test_public");
    writeFileSync(join(bin, "docker"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE"\n', {
      mode: 0o755,
    });
    const result = spawnSync(
      "bash",
      [
        resolve("scripts/preview-container-build.sh"),
        source,
        output,
        join(root, "config"),
        join(root, "key"),
      ],
      {
        env: {
          PATH: `${bin}:/usr/bin:/bin`,
          CAPTURE: capture,
          GITHUB_TOKEN: "secret-token",
          GITHUB_OUTPUT: "/runner/output",
          NEON_API_KEY: "secret-neon",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(capture, "utf8").split("\n");
    assert.deepEqual(
      args.filter((_, i) => args[i - 1] === "--mount"),
      [`type=bind,src=${source},dst=/source,readonly`, `type=bind,src=${output},dst=/output`],
    );
    assert.deepEqual(
      args.filter((_, i) => args[i - 1] === "-e"),
      [
        "HOME=/tmp/home",
        `BUILD_CONFIG=${Buffer.from('{"name":"preview"}').toString("base64")}`,
        "VITE_CLERK_PUBLISHABLE_KEY=pk_test_public",
      ],
    );
    for (const value of ["--read-only", "--cap-drop", "ALL", "no-new-privileges", "1000:1000"])
      assert.ok(args.includes(value));
    assert.ok(args.some((arg) => /^node@sha256:[a-f0-9]{64}$/.test(arg)));
    assert.doesNotMatch(args.join("\n"), /secret-token|secret-neon|\/runner\/output|docker\.sock/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "real container can run dependency executables during install and build",
  { skip: !ordinaryContainer, timeout: 120_000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "preview-ordinary-"));
    try {
      const source = join(root, "source");
      const output = join(root, "output");
      mkdirSync(join(source, "dependency"), { recursive: true });
      mkdirSync(output, { mode: 0o777 });
      spawnSync("chmod", ["755", root]);
      spawnSync("chmod", ["777", output]);
      writeFileSync(join(root, "config"), "{}");
      writeFileSync(join(root, "key"), "pk_test_public");
      writeFileSync(
        join(source, "package.json"),
        JSON.stringify({
          name: "ordinary-fixture",
          version: "1.0.0",
          dependencies: { fixture: "file:dependency" },
          scripts: { build: "fixture" },
        }),
      );
      writeFileSync(
        join(source, "package-lock.json"),
        JSON.stringify({
          name: "ordinary-fixture",
          version: "1.0.0",
          lockfileVersion: 3,
          packages: {
            "": {
              name: "ordinary-fixture",
              version: "1.0.0",
              dependencies: { fixture: "file:dependency" },
            },
            dependency: {
              name: "fixture",
              version: "1.0.0",
              hasInstallScript: true,
              bin: { fixture: "probe" },
            },
            "node_modules/fixture": { resolved: "dependency", link: true },
          },
        }),
      );
      writeFileSync(
        join(source, "dependency", "package.json"),
        JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          bin: { fixture: "probe" },
          scripts: { install: "./probe" },
        }),
      );
      writeFileSync(
        join(source, "dependency", "probe"),
        "#!/bin/sh\nmkdir -p dist\nprintf ok > dist/result\n",
        { mode: 0o755 },
      );
      const result = spawnSync(
        "bash",
        [
          resolve("scripts/preview-container-build.sh"),
          source,
          output,
          join(root, "config"),
          join(root, "key"),
        ],
        {
          env: { PATH: process.env.PATH },
          encoding: "utf8",
          timeout: 110_000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(join(output, "result"), "utf8"), "ok");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "real container keeps hostile build code away from host files and secrets",
  { skip: !realContainer, timeout: 120_000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "preview-hostile-"));
    try {
      const source = join(root, "source");
      const output = join(root, "output");
      mkdirSync(source, { mode: 0o755 });
      mkdirSync(output, { mode: 0o777 });
      spawnSync("chmod", ["755", root]);
      spawnSync("chmod", ["777", output]);
      const sentinel = join(root, "host-secret");
      writeFileSync(sentinel, "host-only");
      writeFileSync(join(root, "config"), "{}");
      writeFileSync(join(root, "key"), "pk_test_public");
      writeFileSync(
        join(source, "package.json"),
        JSON.stringify({
          name: "hostile-fixture",
          version: "1.0.0",
          scripts: { build: "node hostile.cjs" },
        }),
      );
      writeFileSync(
        join(source, "package-lock.json"),
        JSON.stringify({
          name: "hostile-fixture",
          version: "1.0.0",
          lockfileVersion: 3,
          packages: { "": { name: "hostile-fixture", version: "1.0.0" } },
        }),
      );
      writeFileSync(
        join(source, "hostile.cjs"),
        `
      const fs = require('node:fs');
      const canRead = p => { try { fs.readFileSync(p); return true; } catch { return false; } };
      let sourceWritable = true;
      try { fs.writeFileSync('/source/changed', 'x'); } catch { sourceWritable = false; }
      fs.mkdirSync('dist/server', { recursive: true });
      fs.mkdirSync('dist/client', { recursive: true });
      fs.symlinkSync('/etc/passwd', 'dist/server/index.js');
      fs.writeFileSync('dist/result.json', JSON.stringify({
        secret: process.env.HOST_TEST_SECRET || null,
        hostFile: canRead(${JSON.stringify(sentinel)}),
        dockerSocket: fs.existsSync('/var/run/docker.sock'),
        sourceWritable,
      }));
    `,
      );
      const result = spawnSync(
        "bash",
        [
          resolve("scripts/preview-container-build.sh"),
          source,
          output,
          join(root, "config"),
          join(root, "key"),
        ],
        {
          env: { PATH: process.env.PATH, HOST_TEST_SECRET: "host-only" },
          encoding: "utf8",
          timeout: 110_000,
          maxBuffer: 1024 * 1024,
        },
      );
      assert.equal(result.status, 0, `container failed with status ${result.status}`);
      assert.deepEqual(JSON.parse(readFileSync(join(output, "result.json"), "utf8")), {
        secret: null,
        hostFile: false,
        dockerSocket: false,
        sourceWritable: false,
      });
      assert.notEqual(
        spawnSync(process.execPath, ["scripts/preview-package.mjs", output, join(root, "artifact")])
          .status,
        0,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
