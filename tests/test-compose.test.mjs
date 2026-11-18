import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const vars = (name) =>
  `CLERK_SECRET_KEY=synthetic\nVITE_CLERK_PUBLISHABLE_KEY=synthetic\nMARKER=${name}\nDATABASE_URL=must_not_be_used\n`;

test.each([
  {
    name: "example fallback",
    local: [],
    expectedEnv: ".env.example",
    expectedVars: ".dev.vars.example",
  },
  {
    name: "local defaults",
    local: [".env", ".dev.vars"],
    expectedEnv: ".env",
    expectedVars: ".dev.vars",
  },
  {
    name: "local env only",
    local: [".env"],
    expectedEnv: ".env",
    expectedVars: ".dev.vars.example",
  },
  {
    name: "local vars only",
    local: [".dev.vars"],
    expectedEnv: ".env.example",
    expectedVars: ".dev.vars",
  },
  {
    name: "explicit overrides",
    local: [".env", ".dev.vars"],
    overrides: { ENV_FILE: "custom-env", DEV_VARS_FILE: "custom-vars" },
    expectedEnv: "custom-env",
    expectedVars: "custom-vars",
  },
  {
    name: "missing explicit vars",
    local: [".env", ".dev.vars"],
    overrides: { DEV_VARS_FILE: "missing-vars" },
    fails: true,
  },
])(
  "Compose file selection: $name",
  async ({ local, overrides, expectedEnv, expectedVars, fails }) => {
    const root = await mkdtemp(join(tmpdir(), "compose-selection-"));
    try {
      await mkdir(join(root, "scripts"));
      await mkdir(join(root, "bin"));
      await copyFile(
        new URL("../scripts/test-compose.sh", import.meta.url),
        join(root, "scripts/test-compose.sh"),
      );
      for (const file of [
        ".env.example",
        ".dev.vars.example",
        "custom-env",
        "custom-vars",
        ...local,
      ]) {
        await writeFile(join(root, file), vars(file));
      }
      await writeFile(
        join(root, "bin/docker"),
        `#!/bin/sh
case " $* " in
  *" up "*)
    printf 'ENV=%s\\n' "$ENV_FILE"
    grep '^MARKER=' "$DEV_VARS_FILE"
    grep '^DATABASE_URL=' "$DEV_VARS_FILE"
    ;;
esac
`,
        { mode: 0o755 },
      );
      const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` };
      delete env.ENV_FILE;
      delete env.DEV_VARS_FILE;
      const result = spawnSync("sh", [join(root, "scripts/test-compose.sh")], {
        cwd: root,
        env: { ...env, ...overrides },
        encoding: "utf8",
        timeout: 10000,
      });
      if (fails) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Missing CLERK_SECRET_KEY in DEV_VARS_FILE/);
        assert.equal(result.stdout, "");
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
          result.stdout,
          `ENV=${expectedEnv}\nMARKER=${expectedVars}\nDATABASE_URL=postgres://directory_test:local_test_only@db:5432/directory_test\n`,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
