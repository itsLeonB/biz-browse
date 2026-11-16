# Business-for-sale directory: agreed MVP scope

## Status and authority

The user confirmed this scope. It is not approval to build or deploy the app, buy a domain, or buy services. This document states the agreed scope, not a verified deployment.

The team has an SWE and a product person. TanStack Start, Cloudflare Workers, Clerk, Neon PostgreSQL, and private Cloudflare R2 are the chosen stack. Verify the complete integration and free-tier fit before deployment.

## Purpose and audience

Market and list whole operating businesses for sale in Indonesia. Serve owners, not brokers. Do not handle transactions or act as a broker.

Exclude minority stakes, asset-only sales, property-only sales, and offers to open a new franchise. An existing operating franchise business can qualify.

Use Bahasa Indonesia and IDR only. Business names are public; this is not a confidential-sale service. Owners are already waiting and have agreed to named public listings. The team will recruit initial buyers through direct outreach.

Listings are free during the pilot. Do not add buyer or seller accounts or seller self-service. Launch publicly after functional checks, without a separate private pilot. No launch date or application-level listing-count cap has been set. Technical PR previews are separate from the public pilot.

## Buyer experience and listing content

Buyers can browse without signing in, filter by category, city/regency, and asking price, open a listing, and contact its owner through WhatsApp.

Each listing has one category and one city/regency. Admins select these values from shared database tables, not free text. The SWE maintains those tables outside the app; do not add a curation UI.

| Content | Rule |
| --- | --- |
| Identity and location | Business name, category, and city/regency are required. Exact street address is optional. |
| Description | Describe the business and state what the asking price includes and excludes. |
| Price | Public asking price in IDR is required. It is the owner's asking price, not a platform valuation. |
| Photos | At least one owner-approved photo is required. |
| Contact | Publish an authorized WhatsApp number with approval for that exact number's public exposure. A personal or business number is acceptable. |

Revenue and profit figures are optional. Label them as owner-reported and unverified, with their period and meaning stated. Listing approval does not verify financial claims, certify ownership, or guarantee a sale.

WhatsApp is the only buyer-to-owner contact route. Do not build a contact form, internal messaging, or message storage. A WhatsApp click is not proof of a delivered enquiry.

## Admin and listing workflow

Provide a browser editor under `/admin` for the SWE and product person. Use separate Clerk accounts with the same listing-management rights. Do not share credentials or add a role hierarchy.

Only explicitly authorized admins can access private content or create, edit, publish, and unpublish listings. Check the session and two-user allowlist server-side on every private route and server function, including generated endpoints outside `/admin`. The URL prefix and authentication alone do not grant admin access.

Admins create listings from details supplied outside the app. Owner and contact permission are prerequisites managed outside the app. Do not build an owner-approval, consent-record, or formal ownership-verification workflow.

Keep drafts and their photos private. Public routes expose only approved public content from published listings, not internal records or credentials. Server-side validation enforces required content before publication and when saving changes to a published listing.

Saving valid changes to a published listing changes its public content immediately. Do not require unpublishing first or add a separate draft revision. If both admins edit the same listing, the last save wins; it can overwrite the other admin's changes. Do not add stale-save rejection, edit locks, or version-history screens.

Owners report changes outside the app. Admins unpublish sold or withdrawn listings. Do not add expiry, renewal, or freshness reminders. Stale listings remain a known risk.

## Application and data architecture

Use one TanStack Start application and one Cloudflare Workers backend runtime per deployment. The same app serves public listing pages and the private browser admin. Do not add Astro, a second frontend, or a separate backend service.

Render public listing pages as server HTML and read current published data. Listing changes must not require a site rebuild.

Workers connects to Neon PostgreSQL from server-side code. Store database credentials in Worker secrets, never browser bundles or public configuration. Server-side functions own data access, validation, listing rules, and photo access.

Use private R2 buckets for photos. The Worker checks admin access for private photos and listing publication status before serving public photos. Do not enable a public bucket URL that bypasses those checks.

Unpublishing must stop new public delivery through the app, including direct photo requests. It cannot recall downloaded files, screenshots, or copies already held by browsers or third parties.

## PR previews and credentials

Use Neon's native branches to isolate preview data and schema changes. D1 and custom database-branching systems are outside the chosen stack.

Preview data may be made up or real. When humans explicitly use real data, assume they already have permission. Do not add a separate preview permission workflow or access, retention, or cleanup policy. The existing admin-access and environment-isolation requirements still apply.

The SWE manually creates Neon preview branches and separate private R2 buckets. Neon database branching does not branch photos. Do not automate branch or bucket creation or cleanup.

Automate credential retrieval and deployment so each trusted, same-repository PR can deploy its own Worker. Do not supply credentials to fork or untrusted PRs. The SWE controls the mapping from each PR to its Neon project, branch, database and role, Worker, and R2 bucket.

A trusted deployment job may hold a Neon project API key that can also retrieve production credentials. This is an accepted risk: the key is not branch-only. Keep it out of PR builds, dependency execution, deployed Workers, logs, and artifacts. Use trusted workflow and deployment code for privileged steps; do not execute PR-controlled build code with provider credentials available.

Retrieve the connection string with an explicit project, branch ID, database, and role. Omitting Neon's branch ID can select the default branch. A missing or invalid mapping must stop preview deployment, never fall back to production.

Give each preview Worker only its branch-specific database connection string as a Worker secret. Never use the production connection string in a preview. Preview database credentials must not also authenticate to production; Neon can inherit role passwords, so verify credential separation during manual setup.

Keep preview photos separate from production photos. Target the exact PR Worker and its assigned private R2 bucket. The Neon API key stays in trusted CI, not the Worker. Cloudflare deployment credentials also stay out of PR builds and deployed application code.

## Launch, cost, and operations

Use Cloudflare's free `*.workers.dev` address and a Clerk development instance for the initial public pilot. Do not buy a domain for this phase.

The user chose this setup despite Clerk's statement that development instances have a relaxed security posture and are not suitable for production workloads. Record it as an unsupported production choice, not a production-ready authentication decision. Two allowlisted admins do not remove that provider warning.

Clerk documents development keys for some provider preview domains. This does not prove `workers.dev` compatibility. Sign-in, sessions, and the full integration still need a smoke test on the chosen deployment URLs.

Target free tiers. A payment card is not ruled out; billing overages will be managed separately. This is not an unlimited-use or zero-total-cost promise. Temporary downtime at free-tier limits is acceptable while the team decides what to do. No paid upgrade has been authorized. Provider quotas still apply even though the app has no listing-count cap.

Before deployment, check the full application integration, server-side admin allowlist, draft and photo privacy, publish/edit/unpublish behavior, preview credential and photo isolation, exact Worker targeting, and free-tier fit. No such deployment checks have run as part of this scope review.

## Exclusions and known limits

Do not add:

1. Seller submissions or accounts, buyer accounts, or saved listings.
2. Payments, subscriptions, escrow, brokerage workflows, or internal chat.
3. Analytics, enquiry tracking, delivery measurement, or owner enquiry-count surveys.
4. Public support channels, ticketing, automated reminders, or listing expiry.
5. Translations, currency conversion, map search, AI features, or deal rooms.

The original goal was delivered buyer enquiries. Measurement is deferred, so this MVP will not establish how many enquiries reached owners or how useful buyers were.

Known limits include stale listings, silent overwrites between admins, unsupported production use of Clerk development keys, a production-capable Neon key in trusted CI, provider quotas, and public copies that cannot be recalled after unpublishing.

## Source references

These references support the integration constraints. They do not prove a working deployment.

| Topic | Official documentation |
| --- | --- |
| Clerk development and preview environments | [Managing environments](https://clerk.com/docs/guides/development/managing-environments) |
| Clerk production setup | [Deploy to production](https://clerk.com/docs/guides/development/deployment/production) |
| Neon native branches | [Branching](https://neon.com/docs/introduction/branching) |
| Exact Neon connection selection | [Connection URI API](https://neon.com/docs/reference/api/projects/get-connection-uri) and [CLI](https://neon.com/docs/reference/cli-connection-string) |
| Neon API key permissions | [API keys](https://neon.com/docs/manage/api-keys) and [user permissions](https://neon.com/docs/manage/user-permissions) |
| Neon inherited credentials | [Protected branches](https://neon.com/docs/manage/protected-branches) |
| GitHub PR secrets and trust | [PR workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) and [pull_request_target risks](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target) |
| Worker CI and secrets | [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) |
| R2 access and privacy | [Worker bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/) and [bucket public access](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| Limits of recalling cached content | [HTTP caching, sections 6–7](https://www.rfc-editor.org/rfc/rfc9111.html#section-6) |
