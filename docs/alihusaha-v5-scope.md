# AlihUsaha v5 scope

Status: approved. The design interview is complete, including the completion defaults below. Implementation is a separate task; this approval does not authorize app-code changes.

Reference: `mockups/AlihUsaha_v5_Editorial_Glass.html`.

## Agreed decisions

- Use AlihUsaha as the public brand and Indonesian for the interface.
- Apply the full v5 design. Build real features, not demo-only controls.
- Support business acquisitions, operating-outlet takeovers, new franchises or partnerships, and business asset sales. Exclude standalone property sales and minority investments.
- Keep admin approval before publication. Approval does not verify financial claims or ownership.
- Make `/` the home page and add a separate explore page. Preserve existing listing URLs and redirect old directory filter URLs to matching explore results.
- Apply the v5 style to all pages, including admin and sign-in. Keep existing admin controls and safety checks.
- Changes to seller eligibility policy are outside this design task.

## First release

- Home, explore, and listing detail pages.
- Keyword search, filters, sorting, favorites, comparison, and saved searches without alerts.
- Seller submission wizard and seller dashboard.
- Start with business acquisition: whole operating businesses. Defer outlet takeovers, new franchises or partnerships, and asset-only sales. The four-type model is the longer-term scope, not a requirement to build all four now.
- Apply this limit to the whole interface, not just the seller wizard: omit unsupported offer types from home categories, filters, forms, and comparison.
- The v5 visual design, including mobile layouts and supported glass effects.

## Later releases

Paid promotion, professional services, identity checks, NDAs, document rooms, and in-app chat. Hide their navigation and controls rather than show coming-soon previews. Also omit contact-history and enquiry-inbox tabs, since this release does not store enquiries.

Do not show invented completeness, active-contact, or verification claims. Use neutral labels that match the available facts.

## Contact flow: user requirement

On enquiry form submission, record an event in PostHog and build a message from the form answers. When the buyer selects the WhatsApp action, open WhatsApp addressed to the seller with that message filled in. The buyer sends it in WhatsApp; the site does not send it automatically.

Buyers can browse and contact sellers without signing in. Accounts are required for cross-device favorites, saved searches, and seller tools. One account has separate buyer and seller profiles, with only one active at a time. Switching changes the dashboard and available actions, preserves both profiles' data, and does not grant admin access.

PostHog receives event metadata only, such as listing ID, offer type, channel, and action. Do not send buyer names, phone numbers, email addresses, or message text. Form capture and session replay must not expose private fields.

Use opt-out analytics, as requested. The opt-out control and tracking failure must not block contact. Check the privacy notice and applicable consent requirements before enabling this policy in production; opt-out is a product choice, not a finding of legal compliance.

Do not store enquiry answers in the app database. Use them only to build the message. There is no enquiry inbox, and no dashboard count may imply delivered enquiries.

Email is an optional second channel. Show it only when the seller supplies and approves a public email address. Open the buyer's email app with a prepared subject and message; do not send email from the server.

Require only buyer name and message. Budget and reply contact are optional. Keep private form answers out of analytics.

Remove the mockup's confidentiality toggle. Clearly explain which listing details become public. Revealing contacts after a form is not a promise of seller anonymity or confidential access.

Neither a form submission nor a contact click proves message delivery.

## Seller form and review

Use the mockup's acquisition fields, not a union of mockup and MVP form fields. Add only real photo uploads and seller WhatsApp/optional email inputs to replace hard-coded demo values. Do not add separate MVP-only questions.

Keep the acquisition fields shown in the mockup: operating model, scale, listing title, industry, description, city, district, business age, staff, optional monthly revenue and net profit, asking price, included assets, and sale reason. Remove promotion and confidentiality controls. Label monthly figures and their meaning explicitly; do not silently reinterpret old financial data. Preserve existing stored disclosures and validation.

Seller submissions need admin approval. Seller edits to a published listing create a pending revision; the last approved version stays public. Admins can approve or return a submission with a reason. Sellers can unpublish their own listings immediately. Enforce access to each seller's own data on the server, not through the active-profile switch.

Do not invent values, financial figures, stock listing photos, or seller contacts. Do not expand seller eligibility policy in this task.

## Approved completion defaults

The user approved these defaults with the full spec.

### Pages and visual design

Use `/` for home, `/explore` for discovery, and keep `/listings/$listingId`. Use `/sell` for the wizard and `/dashboard` for the active profile. Keep `/admin` and the existing sign-in route. Preserve old directory filter links through redirects.

Apply the mockup's final v5 appearance: green/cream palette, typography, editorial hero and categories, card layouts, pill buttons, spacing, and selective glass effects. Use its mobile layouts, fallback surfaces, reduced-motion rules, and reduced-transparency rules. Adapt admin and real loading/error states to the same design rather than copy demo behaviour.

Match the mockup except for the explicitly agreed scope changes, truthful claims, and accessibility or production fixes. Use editorial stock imagery only for decorative sections, never to represent an actual listing. Do not invent businesses, service providers, testimonials, or market statistics to fill empty sections.

### Discovery and saved data

Use mockup search, multi-select filters, sorting, active-filter chips, and grid/list controls for supported acquisition data. Hide other offer-type segments and filters. Home categories must link to real supported filters. Preserve the user's filters in explore URLs.

Compare up to three acquisitions, using the mockup comparison layout. Keep comparison selection within the current browser session and preserve it while navigating. Show missing optional figures as not supplied, not zero. Do not compare financial figures with different periods as if they matched.

Save buyer favorites and named search criteria to the account. Saved searches have no alerts. Use only real listing counts; hide unsupported statistics and lead metrics. Buyer dashboard: saved listings and searches. Seller dashboard: owned listings, draft/review status, and listing actions. Hide deferred tabs.

### Recovery and acceptance

Preserve existing publication validation, admin safeguards, upload errors, unsaved-change warnings, and last-photo protection. Add real loading, empty, invalid-input, expired-session, save/upload failure, and retry states where the new workflows need them. Draft saving must survive a page reload.

Check desktop, tablet, and mobile layouts at 1440, 768, and 390 CSS pixels, plus narrow-width overflow. Check keyboard navigation, focus after dialogs and updates, readable contrast, labelled inputs, and usable touch controls. Preserve working controls when blur or motion effects are unavailable or disabled.

Test acquisition discovery, saved state across profile switches and reloads, seller ownership isolation, submission/revision approval, unpublication, anonymous message handoff, encoded WhatsApp/email links, and analytics opt-out/failure. Check that private enquiry values never reach analytics or replay capture and that no event claims delivery.

Use the existing test stack. No new package is needed merely to reproduce the mockup's CSS. Keep any runtime additions limited to features approved here, including PostHog.

## Delivery boundaries

This is a product expansion and a visual redesign, not a stylesheet-only change. Implementation will need account-owned data, seller drafts and review revisions, saved items/searches, acquisition discovery data, optional seller email, and analytics controls. Follow `docs/migrations.md` for schema work.

Build in small parts: shared v5 layout and public pages; discovery; profiles and saved data; seller submission and review; contact analytics and end-to-end checks. Keep existing listing links and stored data intact. Do not assume old admin-created listings belong to a newly signed-in seller.

A calendar estimate needs an implementation breakdown; this interview does not establish one.

## Evidence from the current app

- `src/routes/index.tsx`: public directory with category, city, and asking-price filters.
- `src/routes/listings.$listingId.tsx`: public listing details and direct WhatsApp contact.
- `src/routes/admin.tsx`: admin drafts, photo uploads, publication, and error handling.
- `src/server/publication.server.ts`: publication checks.
- `GLOSSARY.md`: domain terms and the limits of listing approval.

The mockup uses temporary browser state for many added functions. Its sample data, trust badges, paid offers, and identity checks are not working services. Preserve the app's existing validation, contact-permission notices, and error handling when applying the design. The inspected app does not store a separate consent record.
