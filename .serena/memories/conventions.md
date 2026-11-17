# Conventions
- UI copy stays Indonesian; use GLOSSARY.md domain distinctions, especially asking price vs valuation and approval vs verification.
- Server-only modules stay under src/server and load inside createServerFn handlers. Preserve server authorization; UI hiding is not authorization.
- Asking prices and taxonomy IDs cross the boundary as decimal strings; BigInt avoids rounding. Keep ID range validation before database queries.
- Preserve admin editVersion/loadVersion guards: slow saves or photo loads must not overwrite newer edits or restore deleted photos.
- oxfmt handles format; oxlint handles lint. Generated src/routeTree.gen.ts is not hand-maintained.