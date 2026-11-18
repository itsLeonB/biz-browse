# Writing tests

Adapted from [OpenClaw's test-writing guide](https://github.com/openclaw/openclaw/blob/main/docs/help/testing/writing-tests.md).

## Approved test setup

### Frameworks and test boundaries

- Use Vitest for unit tests and HTTP/database integration tests. Keep integration
  tests on an isolated app, PostgreSQL database, and local R2 storage.
- Use Vitest with React Testing Library and jsdom for component behavior. Do not
  use jsdom to prove layout or real-browser behavior.
- Use Playwright Test for full browser journeys and real-browser layout, focus,
  and accessibility checks. Keep axe checks. Tests with stubbed services prove
  isolated UI behavior, not end-to-end integration.
- Replace custom Chrome DevTools Protocol control with Playwright. Preserve the
  existing behavior checks and resource cleanup when moving tests.

### Shared SQL fixtures

A shared fixture is synthetic data loaded before tests. A migration changes the
schema. SQL that performs a test action, checks a result, or cleans up belongs in
that test, not in the shared seeds.

Keep `taxonomy.sql` and `directory.sql` in `seeds/test/`. Keep schema
migrations in `db/` and per-test SQL with its tests. Do not add a seeder package.
Load `taxonomy.sql` before `directory.sql` on a fresh isolated database; the
fixtures are not safe to load twice and tests depend on their generated IDs.
They create photo metadata, not R2 image objects.

Preserve the setup used by the Compose script and admin browser tests. Never load test seeds into production.

### Required CI coverage

1. Run unit, component, HTTP/database, and browser tests on trusted pull requests
   and pushes to `main`. Authenticated Clerk tests are required, not opt-in.
2. Supply dedicated Clerk test-instance credentials through GitHub Actions
   secrets. Keep keys and session tokens out of source, logs, and test reports.
   Use temporary test users and retain cleanup of users, containers, and data.
3. Install the browser and its required system libraries in CI. Fail required
   jobs when browser setup or Clerk credentials are missing; do not count a
   skipped required suite as a pass.
4. Run tests that need no secrets on fork pull requests. State explicitly that
   authenticated Clerk coverage did not run. Never pass secrets to fork code,
   including through `pull_request_target`.

See the README for the required GitHub Actions variables and secrets.

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

- Run a focused unit test with `npx vitest run tests/<file>.test.ts`.
- Run `./scripts/test-compose.sh` for tests that need the isolated app, database,
  and local R2 storage. Its authenticated cases need the Clerk test setup in
  `README.md`.
- Run the relevant format, lint, typecheck, and build scripts after changes.
  Report failures and skipped checks with their cause.
