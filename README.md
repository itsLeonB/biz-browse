# Direktori Bisnis

Buyers can browse and filter published listings without an account. Admins can publish complete drafts, edit live listings, and unpublish them. Published details and owner-approved photos are public through the Worker; drafts and unpublished listings stay private. The server requires separate price-inclusion and price-exclusion fields but does not verify their meaning.

## Local Docker setup

1. Copy `.env.example` to `.env` and `.dev.vars.example` to `.dev.vars`. Set the Clerk publishable key in `.env` and `.dev.vars`, the secret key in `.dev.vars`, and `ADMIN_USER_IDS` to one or more Clerk user IDs separated by commas. The example keys are placeholders, not working credentials. Never commit the real files.
2. Run `ENV_FILE=.env DEV_VARS_FILE=./.dev.vars docker compose up --build` and open `http://localhost:3107/admin`. Compose runs the pinned migration runner before starting the app. For an existing database created by the old SQL files, stop: see [migration setup](docs/migrations.md). Do not reset it. Wrangler uses local R2 storage in development. Add category and city rows with `docker compose exec db psql -U directory_test -d directory_test`; these tables are maintained outside the app.
3. Run `./scripts/test-compose.sh` for HTTP tests. It builds a fresh app, a private PostgreSQL database with test taxonomy rows, and local R2 storage in a separate Compose project. It does not use port 3107 on the host. The script uses `.env` and `.dev.vars` when present, with separate fallbacks to `.env.example` and `.dev.vars.example`. Explicit `ENV_FILE` and `DEV_VARS_FILE` values take priority; missing explicit files fail rather than fall back. Example Clerk keys cannot authenticate users. For the full tests, use files with real Clerk test keys and two admin IDs, and export `TEST_ADMIN_1_TOKEN`, `TEST_ADMIN_2_TOKEN`, and `TEST_OUTSIDER_TOKEN` with real Clerk session tokens. The script forces the app to use its isolated database, then removes the test containers and data. Do not commit or print tokens or keys.

### Tests

- `npm test` or `npm run test:unit` runs the Vitest unit and jsdom component tests. Run one file with `npx vitest run tests/separator.test.mjs`.
- `npm run test:compose` runs HTTP and database tests in isolated Docker resources. Shared seeds load taxonomy before directory data. Never point these tests at production.
- Run `npx playwright install --with-deps chromium` and `npm run build` before browser tests. With working Clerk keys in `ENV_FILE` and `DEV_VARS_FILE`, run `./scripts/test-compose.sh --browser-public`. For an existing isolated app, set `TEST_BASE_URL` and run `npm run test:browser -- --project=public`.
- Set `TEST_CLERK_SECRET_KEY` and `TEST_CLERK_PUBLISHABLE_KEY`, then run `npm run test:browser -- --project=clerk`. Use a dedicated Clerk test instance with email/password sign-in enabled. This test creates temporary users and its own Docker project, and deletes both. A hard kill or Clerk outage can leave `admin-...@example.com` users or `admin-browser-...` Docker projects; inspect and remove leftovers manually.

See [writing tests](docs/help/testing/writing-tests.md) for test boundaries. `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build` check the code.

### GitHub Actions setup

Set repository variable `TEST_CLERK_PUBLISHABLE_KEY` to the public publishable key of a dedicated Clerk test instance. Fork code can read this variable; never put a secret in it. Trusted pull requests and pushes to `main` also need these repository secrets:

- `TEST_CLERK_SECRET_KEY` and `TEST_CLERK_PUBLISHABLE_KEY`: matching keys for the dedicated test instance.
- `TEST_ADMIN_USER_IDS`: comma-separated IDs of two test admins in that instance.
- `TEST_ADMIN_1_TOKEN`, `TEST_ADMIN_2_TOKEN`, and `TEST_OUTSIDER_TOKEN`: valid Clerk session tokens for those admins and a separate unlisted user.

Session tokens expire; refresh these secrets before they expire. The HTTP tests do not yet generate tokens. Missing credentials fail the trusted job. Fork pull requests receive no secrets and cannot run authenticated Clerk tests; CI reports that gap. Do not use `pull_request_target` or a Clerk instance containing real users.

## Worker setup and limits

See [dashboard-managed branch Previews](docs/manual-preview.md) for setup and verification. Preview builds remain blocked until trusted-branch and build-secret controls are verified; provider isolation has not been verified.

To prepare a Worker deployment:

1. Create or choose an isolated Neon database, private R2 bucket, and Clerk instance. Follow [migration setup](docs/migrations.md) before applying the initial migration. Populate the category and city tables.
2. In `wrangler.jsonc`, set `name` to the intended Worker name and replace the `PHOTOS` bucket name with the private bucket for that environment. Use a different private bucket for production and every preview. Do not enable a public bucket URL. Neon branches do not copy R2 objects.
3. Authenticate Wrangler to the intended Cloudflare account. Set `DATABASE_URL`, `CLERK_SECRET_KEY`, and `ADMIN_USER_IDS` as Worker secrets with `npx wrangler secret put NAME`, replacing `NAME` with each secret name. Enter each value at the prompt; do not put secrets in commands, Vite client variables, or Wrangler configuration. `ADMIN_USER_IDS` must contain one or more Clerk user IDs separated by commas.
4. Set `VITE_CLERK_PUBLISHABLE_KEY` in the build environment to the matching Clerk publishable key. Run `npm ci`, then `npm run build`. The key is public and becomes part of the client bundle. Rebuild after changing it or the Wrangler configuration.
5. Run `npx wrangler deploy --dry-run` to check the generated Worker and bindings. Production deployment requires the controls in [migration setup](docs/migrations.md). Wrangler uses the configuration generated by the Vite build; do not deploy the source config directly.

Photo deletion removes metadata and records the R2 object key in one database transaction. If R2 deletion fails, an admin can retry the same DELETE request; listing photos in the admin also retries up to 10 pending deletions. After a failed list retry, that entry waits one minute before the next list retry, so other entries can progress. Retries need admin activity: there is no scheduled cleanup. Monitor the `pending_photo_deletions` table and investigate persistent failures.

The authenticated HTTP tests require three real Clerk session tokens and matching Clerk keys.

Worker access to Neon, Clerk sessions on workers.dev, provider free-tier fit, and billing need isolated provider resources and separate deployment authorization. Clerk development keys are not production-ready; workers.dev compatibility is not verified.
