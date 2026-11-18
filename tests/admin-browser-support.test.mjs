import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { testUsers, validateKeys } from "./admin-browser-support.mjs";

test("invalid keys do not appear in validation errors", () => {
  for (const [secret, publishable, invalid] of [
    ["sk_live_sensitive", "pk_test_valid", "sk_live_sensitive"],
    ["sk_test_valid", "pk_live_sensitive", "pk_live_sensitive"],
  ]) {
    assert.throws(
      () => validateKeys(secret, publishable),
      (error) => {
        assert.ok(!String(error).includes(invalid));
        return true;
      },
    );
  }
});

test("browser test output does not reveal an invalid key", () => {
  const key = "sk_live_sensitive_test_value";
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--project=clerk"],
    {
      encoding: "utf8",
      env: {
        ...env,
        TEST_CLERK_SECRET_KEY: key,
        TEST_CLERK_PUBLISHABLE_KEY: "pk_test_valid",
        CHROME_BIN: "/missing-browser",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Use a Clerk test secret key only/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(key));
});

test("cleanup reconciles uncertain creates without deleting preexisting users", async () => {
  const records = [
    {
      id: "existing",
      email_addresses: [{ email_address: "test@example.com" }],
      private_metadata: {},
    },
  ];
  const clerk = async (path, options = {}) => {
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      records.push({
        id: "created",
        email_addresses: [{ email_address: body.email_address[0] }],
        private_metadata: body.private_metadata,
      });
      throw new Error("connection lost after create");
    }
    if (options.method === "DELETE") {
      records.splice(
        records.findIndex((record) => record.id === path.split("/").at(-1)),
        1,
      );
      return;
    }
    return records;
  };
  const users = testUsers(clerk, "unique-run");
  await assert.rejects(users.create("test@example.com", "password"));
  assert.deepEqual(await users.cleanup(), []);
  assert.deepEqual(
    records.map((record) => record.id),
    ["existing"],
  );
});

test("cleanup reports lookup and delete failures", async () => {
  const users = testUsers(async (path, options = {}) => {
    if (options.method === "POST") {
      if (JSON.parse(options.body).email_address[0] === "uncertain@example.com")
        throw new Error("lost");
      return { id: "created" };
    }
    throw new Error("provider unavailable");
  }, "unique-run");
  await users.create("created@example.com", "password");
  await assert.rejects(users.create("uncertain@example.com", "password"));
  assert.deepEqual(await users.cleanup(), [
    "Clerk user for created@example.com",
    "Clerk user for uncertain@example.com",
  ]);
});
