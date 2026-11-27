# AlihUsaha v5 scope

Status: design interview in progress. This records agreed decisions, not approval to implement.

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
- Start with one offer type, still to be selected. The four-type model is the longer-term scope, not a requirement to build all four now.
- The v5 visual design, including mobile layouts and supported glass effects.

## Later releases

Paid promotion, professional services, identity checks, NDAs, document rooms, and in-app chat. Hide their navigation and controls rather than show coming-soon previews. Also omit contact-history and enquiry-inbox tabs, since this release does not store enquiries.

Do not show invented completeness, active-contact, or verification claims. Use neutral labels that match the available facts.

## Contact flow: user requirement

On enquiry form submission, record an event in PostHog and build a message from the form answers. When the buyer selects the WhatsApp action, open WhatsApp addressed to the seller with that message filled in. The buyer sends it in WhatsApp; the site does not send it automatically.

Buyers can browse and contact sellers without signing in. Accounts are required for cross-device favorites, saved searches, and seller tools.

PostHog receives event metadata only, such as listing ID, offer type, channel, and action. Do not send buyer names, phone numbers, email addresses, or message text. Form capture and session replay must not expose private fields.

Use opt-out analytics, as requested. The opt-out control and tracking failure must not block contact. Check the privacy notice and applicable consent requirements before enabling this policy in production; opt-out is a product choice, not a finding of legal compliance.

Do not store enquiry answers in the app database. Use them only to build the message. There is no enquiry inbox, and no dashboard count may imply delivered enquiries.

Email is an optional second channel. Show it only when the seller supplies and approves a public email address. Open the buyer's email app with a prepared subject and message; do not send email from the server.

Require only buyer name and message. Budget and reply contact are optional. Keep private form answers out of analytics.

Remove the mockup's confidentiality toggle. Clearly explain which listing details become public. Revealing contacts after a form is not a promise of seller anonymity or confidential access.

Neither a form submission nor a contact click proves message delivery.

## Open decisions

- The first offer type and its seller fields, price meaning, financial disclosures, filters, and comparison rules.
- Seller account navigation and how admin review handles edits and rejection. Do not expand seller eligibility policy in this task.
- Exact routes for the new pages.
- Favorites, saved searches, dashboard contents, and persistence rules.
- Images, fonts, mobile interactions, accessibility, loading, error recovery, and acceptance checks.

## Evidence from the current app

- `src/routes/index.tsx`: public directory with category, city, and asking-price filters.
- `src/routes/listings.$listingId.tsx`: public listing details and direct WhatsApp contact.
- `src/routes/admin.tsx`: admin drafts, photo uploads, publication, and error handling.
- `src/server/publication.server.ts`: publication checks.
- `GLOSSARY.md`: domain terms and the limits of listing approval.

The mockup uses temporary browser state for many added functions. Its sample data, trust badges, paid offers, and identity checks are not working services. Preserve the app's existing validation, contact-permission notices, and error handling when applying the design. The inspected app does not store a separate consent record.
