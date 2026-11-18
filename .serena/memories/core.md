# Project map
- Single domain: operating businesses for sale in Indonesia; terms in GLOSSARY.md. Directory is not a broker; approval is not financial or ownership verification.
- Public routes: src/routes/index.tsx and listings.$listingId.tsx. Admin edits drafts and publication state via API routes; server modules under src/server.
- Photos use private R2 through Worker endpoints; never expose draft photos through public storage URLs.
- Stack and build constraints: `mem:tech_stack`. Runtime/test setup: `mem:suggested_commands`. Coding rules: `mem:conventions`. Completion checks: `mem:task_completion`.