# Commands and isolation
- npm run dev: port 3107. Local runtime needs Clerk keys, ADMIN_USER_IDS, PostgreSQL, R2 (see README.md).
- ./scripts/test-compose.sh creates isolated database and R2 test storage. Do not point TEST_BASE_URL or TEST_DATABASE_URL at user data: tests write listings/photos.
- CHROME_BIN=/usr/bin/google-chrome node --test tests/admin-races.test.mjs exercises UI state with mocked transport, no live Clerk account.
- Full admin-browser.test.mjs needs dedicated Clerk test instance keys; creates and removes temporary users and Docker project. Never use an instance with real users.