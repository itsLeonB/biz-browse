import { test, expect } from "@playwright/test";
import { reportBrowserFailure } from "./browser-diagnostics.ts";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testUsers, validateKeys, type ClerkTransport } from "./admin-browser-support.ts";

test.afterEach(reportBrowserFailure);

const secret = process.env.TEST_CLERK_SECRET_KEY;
const publishable = process.env.TEST_CLERK_PUBLISHABLE_KEY;

test.beforeAll(() => {
  if (!secret || !publishable)
    throw new Error("Set TEST_CLERK_SECRET_KEY and TEST_CLERK_PUBLISHABLE_KEY");
  validateKeys(secret, publishable);
});

test("admin saves a draft and reopens its saved fields after reload", async ({ page }) => {
  test.setTimeout(600_000);
  const dir = await mkdtemp(join(tmpdir(), "admin-browser-"));
  const project = `admin-browser-${randomBytes(6).toString("hex")}`;
  const userIds = [];
  const password = `Aa1!${randomBytes(18).toString("hex")}`;
  const email = `admin-${randomUUID()}@example.com`;
  let composeStarted = false;
  const clerk: ClerkTransport = async (path, options = {}) => {
    const response = await fetch(`https://api.clerk.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok)
      throw new Error(`Clerk ${options.method ?? "GET"} ${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const users = testUsers(clerk, randomUUID());
  const compose = (...args: string[]) =>
    execFileSync(
      "docker",
      [
        "compose",
        "--project-directory",
        process.cwd(),
        "-p",
        project,
        "-f",
        "compose.test.yaml",
        "-f",
        join(dir, "browser-compose.json"),
        ...args,
      ],
      {
        env: {
          ...process.env,
          ENV_FILE: join(dir, "env"),
          DEV_VARS_FILE: join(dir, "dev.vars"),
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 480_000,
      },
    );
  const retry = async (fn: () => Promise<boolean>, label: string, attempts = 150) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await fn();
        if (result) return result;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  try {
    await writeFile(
      join(dir, "browser-compose.json"),
      JSON.stringify({ services: { app: { ports: ["127.0.0.1::3107"] } } }),
    );
    await writeFile(join(dir, "env"), `VITE_CLERK_PUBLISHABLE_KEY=${publishable}\n`, {
      mode: 0o600,
    });
    for (const address of [email, `admin-${randomUUID()}@example.com`]) {
      userIds.push(await users.create(address, password));
    }
    await writeFile(
      join(dir, "dev.vars"),
      `DATABASE_URL=postgres://directory_test:local_test_only@db:5432/directory_test\nCLERK_SECRET_KEY=${secret}\nVITE_CLERK_PUBLISHABLE_KEY=${publishable}\nADMIN_USER_IDS=${userIds.join(",")}\n`,
      { mode: 0o600 },
    );
    composeStarted = true;
    compose("up", "--build", "-d", "app");
    const port = compose("port", "app", "3107").trim().split(":").at(-1);
    const base = `http://127.0.0.1:${port}`;
    await retry(async () => (await fetch(`${base}/api/drafts`)).status === 403, "test app", 300);
    await page.goto(`${base}/admin`);
    await page.locator('input[name="identifier"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#business_name")).toBeVisible({
      timeout: 30_000,
    });
    const name = `Kedai uji ${randomUUID()}`;
    await page.locator("#business_name").fill(name);
    await page.locator("#description").fill("Deskripsi tersimpan");
    await page.locator("#asking_price").fill("120000000");
    await expect.poll(() => page.locator("#category option").count()).toBeGreaterThan(1);
    await expect.poll(() => page.locator("#city option").count()).toBeGreaterThan(1);
    for (const id of ["category", "city"]) await page.locator(`#${id}`).selectOption({ index: 1 });
    const selected = await Promise.all(
      ["category", "city"].map((id) => page.locator(`#${id}`).inputValue()),
    );
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Listing tersimpan.")).toBeVisible();
    await page.reload();
    await page.locator("li button").filter({ hasText: name }).click();
    await expect(page.locator("#business_name")).toHaveValue(name);
    await expect(page.locator("#description")).toHaveValue("Deskripsi tersimpan");
    await expect(page.locator("#asking_price")).toHaveValue("120000000");
    assert.deepEqual(
      await Promise.all(["category", "city"].map((id) => page.locator(`#${id}`).inputValue())),
      selected,
    );
  } finally {
    const failures = [];
    if (composeStarted) {
      try {
        compose("down", "--volumes", "--remove-orphans");
      } catch {
        failures.push("isolated Docker project");
      }
    }
    failures.push(...(await users.cleanup()));
    await rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    assert.deepEqual(failures, [], "Cleanup failed; remove the listed resources manually");
  }
});
