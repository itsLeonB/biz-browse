# Dashboard-managed branch Previews

**Status: blocked, not verified.** Do not enable Preview Builds until the account's build-secret scope and trusted-branch controls are verified. Cloudflare's [branch documentation](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) says enabling Preview Builds builds every non-production branch. It does not establish a trusted-branch allowlist or fork safety. If the actual controls cannot exclude unsafe builds and production credentials, leave affected builds disabled. Runtime isolation does not protect build secrets or deployment tokens from build code.

The former GitHub Actions preview pipeline and manual deployment scripts are superseded and removed. This leaves no GitHub Actions PR checks; replacement credential-free checks are tracked separately in #13. No provider settings, resources, deployment, or database writes are authorized by this guide.

## Before enabling builds

1. In the existing Cloudflare GitHub connection, verify which branch pushes and fork events trigger builds, which code can change the branch and build commands, and which build variables, secrets, and API token permissions each build receives. Verify that fork and untrusted code cannot run with provider secrets, and that production database and migration credentials cannot reach any non-production build. Record evidence without secrets. Stop if any control is missing or unverified.
2. In Worker → Settings → Build, select the protected production branch. Set build command `npm run build`, production deploy command `npx wrangler deploy`, and Preview command `npx wrangler preview`. Confirm trusted branch triggers can be enforced before enabling them. A push to each allowed branch should update its own Preview even without a PR. Do not use `wrangler versions upload`: version URLs do not provide branch-isolated resources.
3. Existing Builds connections may use the old preview model, which uses production settings. The [switch to Worker Previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds) is irreversible; do not switch without separate authorization. Confirm the Worker uses the new model before any Preview deployment.

## Prepare each Preview

1. With separate authorization, manually create a native Neon branch and private R2 bucket for the trusted branch. Record the exact Neon project, branch ID, database, role, and R2 account and bucket. Confirm each differs from production and other Previews; no defaults or production fallback are allowed. Do not expose the bucket publicly.
2. Confirm the preview role uses independent credentials: Neon branches can inherit role passwords. Check that preview credentials fail against the production endpoint and connect to the intended Preview endpoint and database as the intended role. Never record credentials or connection strings.
3. Set `DATABASE_URL`, `CLERK_SECRET_KEY`, and `ADMIN_USER_IDS` as secrets for the individual Preview through Cloudflare. Do not import production secrets into Previews Base; base secrets apply to new Previews and later changes do not update existing ones. Set the matching `VITE_CLERK_PUBLISHABLE_KEY` for the build. Keep database credentials and provider tokens out of build variables, logs, source, and artifacts.
4. Configure the Preview's non-secret bindings in Cloudflare and copy the dashboard-generated `previews` block into that branch's `wrangler.jsonc`. Set `PHOTOS` to its assigned private bucket. Wrangler uses the branch's config as the source of truth. The checked-in `biz-browse-local-only` bucket is a placeholder, not an approved Preview target. The operator must block deployment if settings are missing or invalid; this repository does not enforce that check. Never substitute production resources.
5. Before application verification, the SWE must apply required reviewed migrations to the exact isolated Preview database. Confirm the target before any write and follow [migration setup](migrations.md), including its adoption warnings. Add preview taxonomy rows if needed. Missing schema or setup is a blocker, not a reason to use production. Do not run migrations from the Preview command or expose production migration credentials.

## Verification after separate authorization

1. Record the branch, Preview URL, resource IDs, test time, operator, and evidence for build-secret and branch controls. Do not record secrets. Verify branch creation and updates without a PR, and rejection of unsafe builds.
2. Verify the deployed Preview's database, role and private bucket. Check Clerk sign-in on its URL, two admin accounts, signed-out and non-allowlisted access, and direct photo requests. Reuse the application and provider checks from #7 and #11, including `tests/http.test.mjs` and `tests/photos.test.mjs` against isolated resources.
3. Compare production database data and photos before and after Preview writes. Record the comparison method and results, failed production authentication, resource bindings, quota and billing limits, skips, and failures. Dashboard settings or a successful connection alone do not prove isolation.

No provider isolation, build-secret scope, Clerk session, production comparison, or quota fit has been verified by this document.
