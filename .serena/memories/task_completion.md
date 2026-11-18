# Completion
- Run npm run format:check, npm run lint, npm run typecheck, npm run build. npm run format fixes formatting in src, vite.config.ts and tests.
- npm test includes environment-gated checks; report skipped browser/HTTP/database tests rather than claiming full runtime coverage.
- Run CHROME_BIN=/usr/bin/google-chrome node --test tests/admin-races.test.mjs for admin UI changes; isolated full HTTP tests use ./scripts/test-compose.sh.
- Work on feature branches; commit work there and leave main unchanged. No deployment without separate authorization.