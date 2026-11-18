import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const vars = (name: string) =>
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
    name: "cleanup failure",
    local: [],
    cleanupFails: true,
    fails: true,
  },
  {
    name: "missing explicit vars",
    local: [".env", ".dev.vars"],
    overrides: { DEV_VARS_FILE: "missing-vars" },
    fails: true,
  },
])(
  "Compose file selection: $name",
  async ({ local, overrides, expectedEnv, expectedVars, fails, cleanupFails }) => {
    const root = await mkdtemp(join(tmpdir(), "compose-selection-"));
    try {
      await mkdir(join(root, "scripts"));
      await mkdir(join(root, "bin"));
      await mkdir(join(root, "tests"));
      await copyFile(
        new URL("./browser-diagnostics.ts", import.meta.url),
        join(root, "tests/browser-diagnostics.ts"),
      );
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
  *" logs "*) printf 'Server marker sk_test_synthetic\\n' ;;
  *" down "*) [ "\${FAIL_CLEANUP:-}" != 1 ] ;;
  *" up "*)
    printf 'ENV=%s\\n' "$ENV_FILE"
    grep '^MARKER=' "$DEV_VARS_FILE"
    grep '^DATABASE_URL=' "$DEV_VARS_FILE"
    ;;
esac
`,
        { mode: 0o755 },
      );
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
      };
      delete env.ENV_FILE;
      delete env.DEV_VARS_FILE;
      const result = spawnSync("sh", [join(root, "scripts/test-compose.sh")], {
        cwd: root,
        env: { ...env, ...overrides, FAIL_CLEANUP: cleanupFails ? "1" : "" },
        encoding: "utf8",
        timeout: 10000,
      });
      if (fails) {
        assert.notEqual(result.status, 0);
        if (!cleanupFails) {
          assert.match(result.stderr, /Missing CLERK_SECRET_KEY in DEV_VARS_FILE/);
          assert.match(result.stderr, /Server marker <REDACTED>/);
          assert.doesNotMatch(result.stderr, /sk_test_synthetic/);
          assert.equal(result.stdout, "");
        }
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

test.each([0, 1])("authenticated runner cleans up after Compose exits %i", async (exitCode) => {
  const root = await mkdtemp(join(tmpdir(), "authenticated-runner-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "tests"));
    await copyFile(
      new URL("../scripts/test-authenticated.ts", import.meta.url),
      join(root, "scripts/test-authenticated.ts"),
    );
    await writeFile(
      join(root, "tests/clerk-http-support.ts"),
      `
import { writeFile } from "node:fs/promises";
export async function createHttpTestUsers() {
  return { adminUserIds: "user_1,user_2", sessionIds: { admin1: "sess_1", admin2: "sess_2", outsider: "sess_3" },
    cleanup: async () => writeFile("cleanup", "done") };
}
`,
    );
    await writeFile(
      join(root, "scripts/test-compose.sh"),
      `#!/bin/sh
[ "$TEST_AUTHENTICATED" = 1 ] && [ "$TEST_ADMIN_1_SESSION_ID" = sess_1 ] &&
[ "$(stat -c %a "$ENV_FILE")" = 600 ] && [ "$(stat -c %a "$DEV_VARS_FILE")" = 600 ] || exit 2
printf '%s' "$ENV_FILE" > file-path
exit ${exitCode}
`,
      { mode: 0o755 },
    );
    const result = spawnSync(process.execPath, ["scripts/test-authenticated.ts"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        TEST_CLERK_SECRET_KEY: "sk_test_synthetic",
        TEST_CLERK_PUBLISHABLE_KEY: "pk_test_synthetic",
      },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, exitCode, result.stderr);
    assert.equal(await readFile(join(root, "cleanup"), "utf8"), "done");
    const filePath = await readFile(join(root, "file-path"), "utf8");
    await assert.rejects(readFile(filePath));
    assert.doesNotMatch(result.stdout + result.stderr, /sk_test_synthetic|pk_test_synthetic/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
