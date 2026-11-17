# Direktori Bisnis

Buyers can browse and filter published listings without an account. Admins can publish complete drafts, edit live listings, and unpublish them. Published details and owner-approved photos are public through the Worker; drafts and unpublished listings stay private. The server requires separate price-inclusion and price-exclusion fields but does not verify their meaning. Migration `004_price_details.sql` stops if any listings are published. Before applying it, arrange to unpublish those listings. After the migration, admins must fill in both price fields before publishing them again.

## Local Docker setup

1. Copy `.env.example` to `.env` and `.dev.vars.example` to `.dev.vars`. Set the Clerk publishable key in `.env` and `.dev.vars`, the secret key in `.dev.vars`, and `ADMIN_USER_IDS` to exactly two distinct Clerk user IDs. The example keys are placeholders, not working credentials. Never commit the real files.
2. Run `ENV_FILE=.env DEV_VARS_FILE=./.dev.vars docker compose up --build` and open `http://localhost:3107/admin`. PostgreSQL applies the SQL migrations in `db/` on its first initialization. For an existing local database, apply each missing migration in order, for example `docker compose exec -T db psql -U directory_test -d directory_test < db/003_publication.sql`. Wrangler uses local R2 storage in development. Add category and city rows with `docker compose exec db psql -U directory_test -d directory_test`; these tables are maintained outside the app.
3. Run `./scripts/test-compose.sh` for HTTP tests. It builds a fresh app, a private PostgreSQL database with test taxonomy rows, and local R2 storage in a separate Compose project. It does not use port 3107 on the host. By default, placeholder Clerk keys let the signed-out tests run; they cannot authenticate users. For the full tests, export `ENV_FILE` and `DEV_VARS_FILE` pointing to files with real Clerk keys and two admin IDs, plus `TEST_ADMIN_1_TOKEN`, `TEST_ADMIN_2_TOKEN`, and `TEST_OUTSIDER_TOKEN` with real Clerk session tokens. The script forces the app to use its isolated database, then removes the test containers and data. Do not commit or print tokens or keys.

To run `npm test` directly, set `TEST_BASE_URL` explicitly to an isolated test app. The tests write drafts and photos and require the fixtures in `tests/taxonomy.sql` and `tests/directory.sql`. Set `TEST_DATABASE_URL` to that isolated database to test live updates. For the authenticated draft test, also set `TEST_CATEGORY_ID` and `TEST_CITY_ID` to rows in that app's database. To run the browser journey, set `CHROME_BIN` to a Chrome executable and use an app with working Clerk keys; the example keys redirect browsers to a nonexistent Clerk domain.

### Admin browser test

Run `node --test tests/admin-browser.test.mjs` with `CHROME_BIN`, `TEST_CLERK_SECRET_KEY`, and `TEST_CLERK_PUBLISHABLE_KEY` set. Use matching keys for a dedicated Clerk **test** instance with email and password sign-in enabled. Docker Compose, Chrome, and access to Clerk are required. The test creates two temporary Clerk users, starts a separate Docker project with its own database and local R2 storage, and deletes the users and project afterward. It never uses an existing admin account. Without these variables, it reports a skip. Cleanup tracks each generated email before creating its user. If a create response is lost, it looks up that email and deletes only users marked with this run's random ID. A hard kill, Clerk outage, or a create that completes after the cleanup lookup can leave users or Docker resources behind. Check the dedicated test instance for leftover `admin-...@example.com` users and Docker for `admin-browser-...` projects; remove leftovers manually. Do not use this test with an instance that contains real users.

`npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build` check the code. `npm run format` applies oxfmt. The Compose database password is for the local test container only.

## Worker setup and limits

See [manual preview preparation and verification](docs/manual-preview.md) for the mapping check and the outstanding deployment and isolation checks. The check is not a guarded deployment path; provider isolation has not been verified.

To prepare a Worker deployment:

1. Create or choose an isolated Neon database, private R2 bucket, and Clerk instance. Apply every SQL file in `db/` in order to the database, then populate the category and city tables. Check migration `004` before applying it to an existing database, as noted above.
2. In `wrangler.jsonc`, set `name` to the intended Worker name and replace the `PHOTOS` bucket name with the private bucket for that environment. Use a different private bucket for production and every preview. Do not enable a public bucket URL. Neon branches do not copy R2 objects.
3. Authenticate Wrangler to the intended Cloudflare account. Set `DATABASE_URL`, `CLERK_SECRET_KEY`, and `ADMIN_USER_IDS` as Worker secrets with `npx wrangler secret put NAME`, replacing `NAME` with each secret name. Enter each value at the prompt; do not put secrets in commands, Vite client variables, or Wrangler configuration. `ADMIN_USER_IDS` must contain exactly two distinct Clerk user IDs separated by a comma.
4. Set `VITE_CLERK_PUBLISHABLE_KEY` in the build environment to the matching Clerk publishable key. Run `npm ci`, then `npm run build`. The key is public and becomes part of the client bundle. Rebuild after changing it or the Wrangler configuration.
5. Run `npx wrangler deploy --dry-run` to check the generated Worker and bindings. When deployment has been separately authorized, run `npx wrangler deploy`. Wrangler uses the configuration generated by the Vite build; do not deploy the source config directly.

Photo deletion removes metadata and records the R2 object key in one database transaction. If R2 deletion fails, an admin can retry the same DELETE request; listing photos in the admin also retries up to 10 pending deletions. Retries need admin activity: there is no scheduled cleanup. Monitor the `pending_photo_deletions` table and investigate persistent failures. Apply `db/005_pending_photo_deletions.sql` before deploying this code.

The authenticated HTTP tests require three real Clerk session tokens and matching Clerk keys.

Worker access to Neon, Clerk sessions on workers.dev, provider free-tier fit, and billing need isolated provider resources and separate deployment authorization. Clerk development keys are not production-ready; workers.dev compatibility is not verified.
