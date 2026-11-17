# Manual preview preparation and verification

**Status: automated deployment disabled.** The PR workflow builds without provider credentials. Its deploy job remains disabled pending review. Do not run the automated deployment entry point directly: it cannot establish artifact provenance or workflow serialization. Resource creation, deployment, and real Clerk sessions require separate authorization.

## Credential-free PR build

The workflow checks PR metadata and the default-branch mapping at `.github/preview-mappings/pr-<number>.json`. Only open, same-repository PRs targeting the default branch and authored by an owner, member, or collaborator pass the build check. Author association is not approval of the code. Changes to workflow code or mappings in a PR do not control its run.

The build checks out the exact PR head, exports its tracked source without Git metadata, and runs it in a non-root container on a fresh GitHub-hosted runner. The container has read-only source and a separate output mount. It receives the validated mapping's non-secret Clerk publishable key and generated config, but no Actions command files, token, Docker socket, provider secrets, or runner workspace mounts. It has network access. Build output and logs are untrusted; the workflow discards container logs and reports only the exit code and general checks. The output mount has a 256 MiB and 4096 inode limit. After the container exits, trusted code checks the whole output for links, size, count and depth before copying and validating it. A separate fresh job downloads the artifact by ID, validates its archive, and packages it again. The deploy runner checks the final manifest hash. Do not use persistent self-hosted runners.

The container's temporary filesystem permits executable files so npm dependencies can run; it remains `nosuid` and `nodev`. Run the ordinary local-dependency fixture with `PREVIEW_CONTAINER_DOCKER_TEST=1 node --test tests/preview-container-build.test.mjs` when the pinned image is present. Tests also include a fake Docker invocation check and an opt-in hostile-fixture test against real Docker. Run the latter only on a disposable, isolated machine with no credentials, no sensitive files, no shared Docker daemon, no external network, and the pinned image already present: `PREVIEW_DISPOSABLE_DOCKER_TEST=1 node --test tests/preview-container-build.test.mjs`. Do not run it on a workstation or shared runner. It does not prove the GitHub-hosted runner boundary. Independent review and safe verification of that boundary are required before deployment. The container can fetch network dependencies, and resource limits do not prove protection against all denial-of-service or kernel attacks.

The standalone `node scripts/preview-artifact.mjs <directory> --validate-only` check accepts bounded Worker JavaScript and client files and prints their sizes and hashes. It rejects links, other server files, and oversized inputs. Normal `dist` includes server configuration and source maps, so it is not a valid deployment artifact. The packaging step selects supported files and validates the result. The packaging hash only checks that the packaged artifact has not changed. The build uses the selected head but can also use untrusted network content or build dependencies. Before enabling deployment, independently verify the source-to-artifact boundary and build inputs. Validation alone does not make an artifact safe to execute.

## Trusted deployment entry point

`node scripts/preview-deploy-entry.mjs <event.json> <mapping-directory> <repository> <artifact-directory> <asset-manifest.json>` validates the PR, mapping and artifact, then uploads the mapped Worker directly through provider APIs. The trusted mapping must include `cloudflare_account_id`, and it must match `CLOUDFLARE_ACCOUNT_ID` before any Neon or Cloudflare request. Set `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` only on the deployment runner. The mapped Worker must already have preview `CLERK_SECRET_KEY` and `ADMIN_USER_IDS` secrets; the upload inherits only those two and replaces `DATABASE_URL`. It fails if either inherited binding is missing. Do not put provider tokens in the Worker.

Cloudflare single-asset upload mode is not supported. The deployment job serializes runs for each PR without canceling an in-progress upload; GitHub may replace an older pending run. The gate rechecks the trusted PR identity, head, and mapping set before provider requests and again before Worker upload. Each gate reads the complete mapping set at the current default-branch commit through the GitHub API. It rejects invalid mappings, duplicate preview Worker or bucket assignments, any preview target matching a live target in the same account, incomplete trees, API errors, and changed refs or selected mappings. Separate accounts may use the same names. The directory must contain only regular `pr-<number>.json` files, with at most 20 mappings. Each gate makes at most 25 mapping-set API requests, plus the identity checks; the deployment entry runs the gate twice. A head or mapping change after the final check can still race with an in-flight upload. Asset uploads occur before the final check. Direct entry-point calls bypass workflow serialization and must not run.

The separate packaging job runs locked `blake3-wasm` without provider credentials to calculate Cloudflare hashes. It binds those hashes and the SHA-256 file manifest in a job output. The fresh deployment runner checks that binding, validates paths and file bytes again, and uploads the bytes it read into memory. It runs trusted scripts and Node standard library only, with no dependency install. Node cannot verify BLAKE3 itself: the packaging job and its dependency must be trusted to compute honest hashes. A compromised packaging dependency can forge the manifest or output and cause wrong assets to be served; SHA-256 binding cannot detect that. The package runner must not retain a process that can alter outputs after hashing; the deploy runner must remain isolated from other processes. A change between packaging validation and hashing is checked against SHA-256, and a change after hashing fails the deploy check. Review this boundary before enabling deployment.

Automatic previews do not require review approval. We accept that trusted same-repository contributors can deploy code that reads and sends preview secrets and data elsewhere. Use isolated preview credentials and data with no access to live resources; prove that isolation before enabling deployment. A compromised trusted account or dependency can abuse preview resources. No provider deployment or isolation check has run.

## Guarded manual deployment

This separate path requires explicit authorization. It does not enable the automated deploy job. Only use trusted scripts, a trusted local `git` and `wrangler`, and a reviewed build artifact on an isolated machine. Do not run a PR build with provider credentials. Artifact validation checks its shape, not its origin or safety; reviewed code and build dependencies can still steal preview data and secrets. Stop if another process can change the artifact, scripts, Git refs, or temporary files during deployment.

1. Review and merge a non-secret mapping at `.github/manual-preview-mappings/pr-<number>.json` on `main`. Its exact shape is `{ "cloudflare_account_id": "<32 lowercase hex characters>", "mapping": { ... } }`, where `mapping` is the object in the Mapping section below without its `cloudflare_account_id`. The manual command uses only the outer account ID. Confirm the account and every preview and live identifier in the provider consoles. The guard checks distinct declared resources; it cannot prove the declarations or credential isolation are true.
2. Fetch `origin/main` from the trusted repository and independently verify the commit and mapping. The command below requires that exact 40-character commit to match the local `origin/main` ref; it does not fetch or verify remote branch protection. Make sure that ref is current and the mapping was approved. Prepare a validated artifact with `server/index.js` and `client/` using the credential-free build and packaging process above.
3. In a private shell, set `NEON_API_KEY` and `CLOUDFLARE_API_TOKEN` without putting values in shell history. Put a trusted Wrangler executable on `PATH`. Run `node scripts/manual-preview.mjs pr-7 <approved-main-commit> <artifact-directory>`. The command fetches the URI for the mapped project, branch, database and role, then sends it to `wrangler secret put` over standard input. It deploys with a temporary explicit config, account, Worker and bucket; it suppresses provider output. It retains existing Worker secrets, so first verify that the Worker has only the intended preview secrets. A failure after the secret update can leave the secret changed even if deployment fails.

The local `origin/main` check and reviewed mapping are operator controls, not provider access controls. Someone with provider credentials can bypass this entry point and run Wrangler or provider APIs directly, including against production. Restrict provider credentials and confirm the actual target independently. A ref change after the last check, or an artifact change during deployment, can race the upload. This path has not been tested against live providers.

## Mapping

The SWE records one non-secret JSON file per preview in the trusted default branch at `.github/preview-mappings/pr-<number>.json`. Protect changes with review. Use exact provider identifiers and the publishable key for the preview Clerk instance. This example is not a real mapping:

```json
{
  "preview_id": "pr-7",
  "cloudflare_account_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "clerk_publishable_key": "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  "preview": {
    "project": "project-example",
    "branch": "br-preview-example",
    "database": "directory",
    "role": "preview_role",
    "worker": "directory-pr-7",
    "bucket": "directory-pr-7"
  },
  "live": {
    "project": "project-example",
    "branch": "br-live-example",
    "database": "directory",
    "role": "live_role",
    "worker": "directory-live",
    "bucket": "directory-live"
  }
}
```

Do not put URLs, passwords, tokens, or other secrets in the mapping. The check requires the expected preview ID and all resource fields. The preview and live branches must differ when they share a project; different projects are allowed. Roles, Workers, and buckets must differ. The account ID is optional for config generation and manual deployment, but required for automated deployment. It accepts only simple resource identifiers and a syntactically valid Clerk publishable key. It cannot verify the key belongs to the intended Clerk instance. It cannot tell whether the declared live resources are correct, whether two identifiers refer to the same resource, or whether credentials are isolated. Independently confirm all mappings in the provider consoles, including the Cloudflare account and the Neon project, before using them.

Generate a candidate config from the project root. Replace the path and ID with the intended mapping. Do not use a config from an earlier run if this command fails.

```sh
node scripts/preview-config.mjs /path/to/mapping.json pr-7 > .preview-wrangler.json
```

A successful command sets the exact Worker name and `PHOTOS` bucket. `PREVIEW_WRANGLER_CONFIG=./.preview-wrangler.json` selects it for the Vite Cloudflare plugin. Check the generated build's `dist/server/wrangler.json` for the same Worker and bucket before any separately authorized deployment. Run builds without Neon or Cloudflare provider credentials or database URLs in their environment. The normal `wrangler.jsonc` uses a local-only placeholder and is not a preview deployment config. Neither this check nor a raw Wrangler command enforces the manual steps.

## Before any authorized deployment

1. In Neon, manually create a native branch and record its project and branch ID. Select the intended database and a preview-only role explicitly. Confirm the live mapping separately. A distinct role name alone does not prove credential isolation: branch creation can inherit parent role passwords. Set independent preview credentials and test them against the live endpoint; authentication must fail. Separately confirm that the preview credentials connect to the intended preview endpoint and that `current_database()` and `current_user` match the mapping. Record outcomes, never credentials or connection strings.
2. Manually prepare a distinct Worker and private R2 bucket in the intended Cloudflare account. Verify the bucket has no public access and differs from every live bucket. Do not use a Worker that could retain a live `DATABASE_URL` secret. Check current free-tier quotas and billing settings; do not purchase or upgrade services.
3. Retrieve the URI only for the mapped Neon project, branch ID, database, and role. The Neon CLI supports explicit `--project-id`, branch ID, `--database-name`, and `--role-name`; never omit one or use a default. Keep the URI out of terminal output, shell history, build environment, client variables, files committed to Git, logs, and artifacts. Set only that preview URI as the preview Worker's `DATABASE_URL` secret. Set Clerk secret and two-admin allowlist as Worker secrets; use the matching Clerk publishable key for the build. Do not give the Worker a Neon API key or Cloudflare deployment token.
4. Apply every SQL migration in `db/` in filename order to the selected preview database, including `003_publication.sql` and `004_price_details.sql`, and add preview taxonomy rows. Confirm the target before each write. Migration `004_price_details.sql` fails if any listings are published; arrange to unpublish them before applying it. Prepare a fresh build with the checked config; confirm the generated deployment config and secret target before deploying. Do not run untrusted PR code with provider credentials. The current local config check does not enforce this separation.

## After separately authorized deployment

1. Record the preview URL and mapped resource IDs, test time, and who performed the checks. Do not record secrets or session tokens. Check that the deployed Worker binds the assigned private bucket and that its configured database secret was installed on the intended Worker. Confirm Clerk sign-in and sessions on the actual preview URL; development keys are not production-ready and workers.dev compatibility is not yet verified.
2. Use both authorized admin accounts to save and reopen a draft and upload and read a photo. Check signed-out and signed-in non-allowlisted users cannot read or change drafts or photos. Repeat direct photo requests as well as browser actions.
3. Reuse `tests/http.test.mjs` and `tests/photos.test.mjs` against the isolated preview with `TEST_BASE_URL`, the two admin session tokens, an outsider session token, and preview taxonomy IDs. These tests write draft and photo data. Keep tokens out of logs and shell history. Check that no authenticated test was skipped; placeholder keys cannot prove these journeys.
4. Compare the selected live database and photo resources before and after the preview writes. Record the comparison method and results, the failed live authentication check from step 1, the Worker/bucket binding, and the free-tier check. A config test or a successful preview connection alone does not prove isolation.

Do not mark issue #7 complete until all applicable provider checks have passed. No provider isolation, Clerk session, live-resource comparison, or free-tier fit is claimed by this document.
