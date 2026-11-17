# Writing tests

Adapted from [OpenClaw's test-writing guide](https://github.com/openclaw/openclaw/blob/main/docs/help/testing/writing-tests.md).

## Prove behavior at the owning boundary

Test a caller-visible contract through the production code that owns it. Use
synthetic data and independent expected values. Name the regression the test
prevents and what it cannot prove.

For listing, authorization, and photo behavior, prefer the application's HTTP
boundary with an isolated database and R2 storage. Use a browser when the
browser's behavior matters. Use a smaller unit test for an independent contract
that does not need the full application. Do not add production exports, flags,
or injection hooks only for tests.

For a regression, show that the test fails on the original defect, not on broken
fixture setup. Then make the fix and show the test passes. If you cannot run the
baseline, say so. Keep distinct contracts when you consolidate tests; remove
duplicate or implementation-coupled proof. Apply the
[test-audit authoring gate](../../../.agents/skills/test-audit/SKILL.md).

## Keep tests isolated and useful

- Give each test its own data and clean up resources it creates. Do not delete
  resources that were already present.
- Use test credentials and synthetic content. Do not print or commit secrets.
- Keep provider-dependent checks opt-in and name what they prove. Mocking a
  provider cannot prove live provider integration or resource isolation.
- Wait for observable state or explicit completion, not arbitrary delays. Give
  asynchronous waits and subprocesses a deadline, and close them during cleanup.
- Fix shared-state leaks at their source instead of relying on test order.
- Measure slow tests. Use a cheaper boundary when it proves the same contract;
  keep browser and live-provider journeys focused on behavior they alone prove.

## Run checks

Use `package.json` for the current scripts and `README.md` for test setup.

- Run a focused test with `node --test tests/<file>.test.mjs` when it does not
  need an application server.
- Run `./scripts/test-compose.sh` for tests that need the isolated app, database,
  and local R2 storage. Its authenticated cases need the Clerk test setup in
  `README.md`.
- Run the relevant format, lint, typecheck, and build scripts after changes.
  Report failures and skipped checks with their cause.
