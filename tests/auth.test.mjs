import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("admin access requires an authenticated user in the configured list", async (t) => {
  const bundle = await build({
    entryPoints: ["src/server/auth.server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "clerk-session-fixture",
        setup(build) {
          build.onResolve({ filter: /^@clerk\/tanstack-react-start\/server$/ }, () => ({
            path: "clerk-session",
            namespace: "fixture",
          }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: "export const auth = async () => globalThis.testClerkSession;",
          }));
        },
      },
    ],
  });
  const { isAdmin } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const original = process.env.ADMIN_USER_IDS;
  try {
    for (const [name, ids, authenticated, userId, expected] of [
      ["one approved admin", "user_first", true, "user_first", true],
      ["two approved admins", "user_first,user_second", true, "user_second", true],
      [
        "more than two approved admins",
        "user_first,user_second,user_third",
        true,
        "user_third",
        true,
      ],
      ["surrounding spaces", " user_first , user_second ", true, "user_first", true],
      ["unlisted user", "user_first", true, "user_other", false],
      ["signed-out user", "user_first", false, "user_first", false],
      ["missing user", "user_first", true, null, false],
      ["empty list", "", true, "user_first", false],
      ["unset list", undefined, true, "user_first", false],
    ]) {
      await t.test(name, async () => {
        if (ids === undefined) delete process.env.ADMIN_USER_IDS;
        else process.env.ADMIN_USER_IDS = ids;
        globalThis.testClerkSession = { isAuthenticated: authenticated, userId };
        assert.equal(await isAdmin(), expected);
      });
    }
  } finally {
    if (original === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = original;
    delete globalThis.testClerkSession;
  }
});
