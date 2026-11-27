# AlihUsaha v5 scope

Status: design interview in progress. This records agreed decisions, not approval to implement.

Reference: `mockups/AlihUsaha_v5_Editorial_Glass.html`.

## Agreed decisions

- Use AlihUsaha as the public brand and Indonesian for the interface.
- Apply the full v5 design. Build real features, not demo-only controls.
- Support business acquisitions, operating-outlet takeovers, new franchises or partnerships, and business asset sales. Exclude standalone property sales and minority investments.
- Keep admin approval before publication. Approval does not verify financial claims or ownership.

## First release

- Home, explore, and listing detail pages.
- Keyword search, filters, sorting, favorites, comparison, and saved searches without alerts.
- Seller submission wizard and seller dashboard.
- The v5 visual design, including mobile layouts and supported glass effects.

## Later releases

Paid promotion, professional services, identity checks, NDAs, document rooms, and in-app chat. Do not show deferred functions as working controls.

## Contact flow: user requirement

On enquiry form submission, record an event in PostHog and build a message from the form answers. When the buyer selects the WhatsApp action, open WhatsApp addressed to the seller with that message filled in. The buyer sends it in WhatsApp; the site does not send it automatically.

The user also requested an email message template. The email handoff and seller email policy remain open. Neither a form submission nor a contact click proves message delivery.

## Open decisions

- Buyer sign-in, enquiry fields, contact visibility, email support, analytics privacy, and whether enquiry content needs durable storage.
- Who can sell, seller account roles, and how admin review handles edits and rejection.
- Page routes, admin design scope, and deferred navigation items.
- Offer-specific fields, price meanings, financial disclosures, filters, and comparison rules.
- Favorites, saved searches, dashboard contents, and persistence rules.
- Images, fonts, mobile interactions, accessibility, loading, error recovery, and acceptance checks.

## Evidence from the current app

- `src/routes/index.tsx`: public directory with category, city, and asking-price filters.
- `src/routes/listings.$listingId.tsx`: public listing details and direct WhatsApp contact.
- `src/routes/admin.tsx`: admin drafts, photo uploads, publication, and error handling.
- `src/server/publication.server.ts`: publication checks.
- `GLOSSARY.md`: domain terms and the limits of listing approval.

The mockup uses temporary browser state for many added functions. Its sample data, trust badges, paid offers, and identity checks are not working services. Preserve the app's existing validation, consent checks, and error handling when applying the design.
