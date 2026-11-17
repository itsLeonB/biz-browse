import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("preview deployment stays disabled and serializes uploads per PR", () => {
  const workflow = readFileSync(".github/workflows/preview-build.yml", "utf8");
  const deploy = workflow.split("\n  deploy:\n")[1];
  assert.ok(deploy);
  assert.match(deploy, /if: \$\{\{ false \}\}/);
  assert.match(
    deploy,
    /concurrency:\s*\n\s*group: preview-deploy-\$\{\{ github\.event\.pull_request\.number \}\}\s*\n\s*cancel-in-progress: false/,
  );
});

test("credential-free build receives the key from the trusted build gate", () => {
  const workflow = readFileSync(".github/workflows/preview-build.yml", "utf8");
  const build = workflow.split("\n  build:\n")[1].split("\n  package:\n")[0];
  assert.match(
    build,
    /trusted\/scripts\/preview-build-entry\.mjs[^\n]*"\$RUNNER_TEMP\/preview-clerk-key"/,
  );
  assert.match(build, /preview-container-build\.sh[^\n]*"\$RUNNER_TEMP\/preview-clerk-key"/);
  assert.match(build, /git -C application archive "\$HEAD_SHA"/);
  assert.match(
    build,
    /preview-package\.mjs "\$RUNNER_TEMP\/build-output" "\$RUNNER_TEMP\/safe-build"/,
  );
  assert.doesNotMatch(build, /path: application\/dist/);
  assert.doesNotMatch(build, /secrets\./);
});
