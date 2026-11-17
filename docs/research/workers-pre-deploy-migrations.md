# PostgreSQL migrations before a Workers deployment

Research checked 2026-11-17. No secrets were read, packages installed, databases contacted, or deployments run. This follows [PostgreSQL migrator options](postgres-migrator-options.md).

## Recommendation

Run `node-pg-migrate` on a **trusted GitHub Actions release runner**, after a credential-free build and before deployment. Use a direct Neon connection. Stop on migration failure. The migration runs in Node on the runner, **not in the deployed Worker**. A separate authorized manual release can use the same order until a release workflow exists.

This is a release design, not an existing command: `node-pg-migrate` and a release script are not installed. The current PR build must stay credential-free and its deploy job must stay disabled until its documented controls are complete. Do not give a PR build database credentials, even for same-repository contributors.

## What Cloudflare actually runs

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) runs an optional build command, then a configurable deploy command, on its build host. Preview builds use a separate configurable preview command instead of the deploy command. A build secret is available to the build, not automatically to the Worker. A command or script that runs migrations and only deploys on success can gate that deployment. This is command sequencing, not a Worker-runtime pre-deploy lifecycle hook. The cited docs do not document a separate general-purpose pre-deploy hook.
- Wrangler's [`build.command`](https://developers.cloudflare.com/workers/wrangler/custom-builds/) runs in the invoking host's shell as part of `wrangler dev` as well as deploy; `WRANGLER_COMMAND` identifies the invocation. It is a custom build facility, not a safe release-only migration gate. Workers Builds says it does not honor custom-build settings in Wrangler configuration. Direct provider API uploads also bypass Wrangler. Do not put migrations there.
- The application Worker can only execute its own code once invoked as a running version; that is not a platform step that blocks publication of that same version. A separate migration Worker invoked by CI before a deploy is possible in principle, but CI must still enforce the gate and provide secure invocation, target validation, failure handling and serialization. It adds a privileged service without removing the release runner.

## Options for this repo

| Approach | Gate and fit |
| --- | --- |
| **Trusted Actions release** | Recommended. Build without database secrets; a separate protected job checks the exact approved revision and target, runs migrations, then deploys only on success. Keep its credentials and executable inputs trusted. A failed migration must fail the job; do not use `continue-on-error`. |
| **Workers Builds commands** | A trusted production branch can use a build/deploy script that migrates before calling Wrangler, with a direct connection in build secrets. The secret is exposed to code and dependencies that run in that build. Preview commands and branch triggers need separate controls; disable untrusted preview builds with privileged secrets. This does not match the existing isolated PR pipeline and adds another deployment path to coordinate. |
| **Authorized local release** | A trusted operator runs a checked release script on an isolated host: build without secrets, verify target and source, migrate, then deploy using `&&` or equivalent failure checks. Smallest initial setup, but manual steps, local credentials, concurrent operators and bypasses need controls. |
| **Worker runtime** | Not recommended. Requests, startup or a newly published Worker do not themselves gate deployment; concurrent invocations and partial failures make migration coordination harder. A separate migration Worker still needs an external gate and privileged runtime credentials. |

The current [`wrangler.jsonc`](../../wrangler.jsonc) has `nodejs_compat`, but no custom build command. [`package.json`](../../package.json) has `vite build` but no migration or deployment script. The [PR workflow](../../.github/workflows/preview-build.yml) builds untrusted source in isolation without provider secrets; its deploy job is `if: false`. Its disabled deploy entry uploads through provider APIs, whereas the separately authorized [manual preview](../manual-preview.md) uses Wrangler. Neither path gains a migration gate merely by changing Wrangler build settings.

## Example release order

For a future **trusted release**, not the current PR workflow:

1. Check out an approved immutable commit; install pinned dependencies and build without database or provider secrets. Bind the reviewed migration files and deployment artifact to that same commit. Verify the artifact's origin, not just its hash.
2. In a fresh protected deployment job, confirm the Cloudflare account and Worker plus Neon project, branch, database and role. Obtain a direct migration URL for exactly that target. Use only trusted scripts, runner dependencies and migration files; never execute PR build output with migration credentials.
3. Run the pinned runner against those source migrations, for example `DATABASE_URL="$MIGRATION_DATABASE_URL" npx --no-install node-pg-migrate up` **after configuring its migration directory and file format**. Do not print the URL. Follow with the approved deploy command only if it exits successfully. Prefer separate sequential job steps: a failure blocks later steps by default. Ensure the deploy command uses the reviewed artifact and correct generated config; raw `wrangler deploy` against this repo's local-only bucket config is not sufficient.
4. Serialize the entire migrate-plus-deploy sequence per actual database/Worker target, including manual and alternate release paths. Recheck release freshness before deployment so an older run cannot overwrite a newer one. A migration lock alone does not order deployments. GitHub [concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency) can prevent overlapping jobs in the same group; it does not coordinate outside GitHub, and pending-run behavior must be chosen deliberately. Avoid canceling an active migration.

Use a [protected GitHub environment](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) with branch restrictions, appropriate reviewers and environment-scoped secrets where supported. Limit migration-role privileges and isolate preview from live credentials and data. A reviewed migration is executable privileged code: a PR artifact's shape check does not authorize running its migrations. For previews, decide separately how a reviewed migration revision maps to the exact PR artifact and isolated Neon target; do not execute arbitrary PR migration files in a secret-bearing job. The existing preview documentation explicitly requires more provenance and isolation review before enabling deployment.

## Data and failure safety

- Neon recommends a [direct connection for migrations](https://github.com/neondatabase/website/blob/main/content/docs/connect/connection-pooling.md): its `-pooler` endpoint uses transaction pooling and does not support session advisory locks. `node-pg-migrate` uses `pg` and, by default, an advisory lock; keep the lock enabled and use a persistent direct session. The app can continue to use Postgres.js and its own appropriately pooled URL. [Runner source](https://github.com/salsita/node-pg-migrate/blob/main/src/runner.ts).
- A successful migration followed by a failed deploy leaves the **new schema with the old Worker**. Rollback of a Worker also does not roll back the database. Use backward-compatible expand/contract changes: add compatible schema first, deploy code, and remove old schema only in a later release after old code is gone. Cloudflare supports [multiple versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/), so account for old versions and rollback, not just the instant of upload.
- Existing SQL can be rewritten or squashed before launch, but preserve the intended schema. In particular, `db/004_price_details.sql` has its own transaction and guard; do not nest its transaction unchanged inside the runner's transaction. Follow the prior report's clean-install, repeat, failure and concurrent-run checks. Local Docker PostgreSQL should use the same migration history rather than also applying the old init files.
- The deploy artifact currently packages Worker/client files, not migration source. Keep migration files in the trusted release checkout or a separately verified artifact; do not assume they exist in the Worker bundle. Tie both inputs to the approved commit. If the target or source changes, stop and re-authorize.

## Worker runtime compatibility: possible parts, unproved whole

Cloudflare documents [`node:fs`](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/) for this compatibility configuration: it is a virtual filesystem, with explicitly bundled files under read-only `/bundle` and request-local, nonpersistent `/tmp`. The repository's migration directory is not automatically a normal host filesystem inside the Worker. `node-pg-migrate` supports [file loading and an in-memory migration map](https://salsita.github.io/node-pg-migrate/migration-loading-strategies), so missing host files are an integration issue, not proof that every API use is impossible.

Cloudflare also documents [`pg` with Neon through Hyperdrive](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/), so claiming that `pg` cannot run in Workers would be wrong. That example does not prove the whole `node-pg-migrate` CLI, its dynamic imports, specific bundled migration format, direct Neon TLS connection, or its session lock works in this Worker. Hyperdrive's pooling must not be assumed to preserve the lock. No runtime integration test was run. Even if a pinned version passes those tests, runtime execution still needs the external release gate and the security controls above.

## Decisions before implementation

1. Choose the authorized release trigger, protected environment and target-specific serialization, including how manual releases are excluded or coordinated.
2. Choose the trusted source and approval policy for preview migrations; keep untrusted builds and the disabled deploy job unchanged until the existing security review is complete.
3. Pin and test `node-pg-migrate`, Node and the migration format; decide whether to squash the existing SQL. Verify direct Neon access and role permissions without exposing credentials.

No deployment, database connection, provider isolation check, runtime compatibility test or release workflow test was performed for this report.
