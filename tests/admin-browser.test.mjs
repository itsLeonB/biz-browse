import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChrome, testUsers, validateKeys } from "./admin-browser-support.mjs";
import { cdp, waitForSocket } from "./browser-support.mjs";

const secret = process.env.TEST_CLERK_SECRET_KEY;
const publishable = process.env.TEST_CLERK_PUBLISHABLE_KEY;
const chrome = process.env.CHROME_BIN;

test(
  "admin saves a draft and reopens its saved fields after reload",
  {
    skip: !(secret && publishable && chrome)
      ? "Set CHROME_BIN, TEST_CLERK_SECRET_KEY and TEST_CLERK_PUBLISHABLE_KEY to run the isolated Clerk browser test"
      : false,
    timeout: 600_000,
  },
  async () => {
    validateKeys(secret, publishable);
    const dir = await mkdtemp(join(tmpdir(), "admin-browser-"));
    const project = `admin-browser-${randomBytes(6).toString("hex")}`;
    const userIds = [];
    const password = `Aa1!${randomBytes(18).toString("hex")}`;
    const email = `admin-${randomUUID()}@example.com`;
    let browser;
    let socket;
    let composeStarted = false;
    const clerk = async (path, options = {}) => {
      const response = await fetch(`https://api.clerk.com/v1${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      });
      if (!response.ok)
        throw new Error(`Clerk ${options.method ?? "GET"} ${path}: ${response.status}`);
      return response.status === 204 ? null : response.json();
    };
    const users = testUsers(clerk, randomUUID());
    const compose = (...args) =>
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
          env: { ...process.env, ENV_FILE: join(dir, "env"), DEV_VARS_FILE: join(dir, "dev.vars") },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 480_000,
        },
      );
    const retry = async (fn, label, attempts = 150) => {
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
      const profile = join(dir, "chrome");
      browser = await startChrome(chrome, [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ]);
      const debugPort = await retry(
        async () => (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0],
        "Chrome",
      );
      const [page] = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await waitForSocket(socket);
      const call = cdp(socket);
      const evaluate = async (expression) => {
        const result = await call("Runtime.evaluate", { expression, returnByValue: true });
        if (result.error || result.result.exceptionDetails)
          throw new Error(`Browser evaluation failed: ${expression}`);
        return result.result.result.value;
      };
      const click = (expression) => evaluate(`${expression}.click()`);
      const enter = async (selector, value) => {
        await retry(
          () => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),
          selector,
        );
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
        await call("Input.insertText", { text: value });
      };
      await call("Page.navigate", { url: `${base}/admin` });
      await enter('input[name="identifier"]', email);
      await click("document.querySelector('button[type=\"submit\"]')");
      await enter('input[name="password"]', password);
      await click("document.querySelector('button[type=\"submit\"]')");
      await retry(
        () =>
          evaluate('location.pathname === "/admin" && !!document.querySelector("#business_name")'),
        "admin form",
      );
      const name = `Kedai uji ${randomUUID()}`;
      await enter("#business_name", name);
      await enter("#description", "Deskripsi tersimpan");
      await enter("#asking_price", "120000000");
      await retry(
        () =>
          evaluate(
            'document.querySelector("#category").options.length > 1 && document.querySelector("#city").options.length > 1',
          ),
        "taxonomy",
      );
      await evaluate(
        'for (const id of ["category", "city"]) { const el = document.getElementById(id); el.selectedIndex = 1; el.dispatchEvent(new Event("change", { bubbles: true })); }',
      );
      const selected = await evaluate(
        'JSON.stringify([document.querySelector("#category").value, document.querySelector("#city").value])',
      );
      await click("document.querySelector('button[type=\"submit\"]')");
      await retry(
        () => evaluate('document.body.innerText.includes("Listing tersimpan.")'),
        "draft save",
      );
      await call("Page.reload");
      await retry(
        () =>
          evaluate(
            `Array.from(document.querySelectorAll("li button")).some(b => b.textContent.includes(${JSON.stringify(name)}))`,
          ),
        "saved draft in list",
      );
      await click(
        `Array.from(document.querySelectorAll("li button")).find(b => b.textContent.includes(${JSON.stringify(name)}))`,
      );
      assert.equal(await evaluate('document.querySelector("#business_name").value'), name);
      assert.equal(
        await evaluate('document.querySelector("#description").value'),
        "Deskripsi tersimpan",
      );
      assert.equal(await evaluate('document.querySelector("#asking_price").value'), "120000000");
      assert.equal(
        await evaluate(
          'JSON.stringify([document.querySelector("#category").value, document.querySelector("#city").value])',
        ),
        selected,
      );
    } finally {
      socket?.close();
      if (browser) {
        browser.kill();
        if (browser.exitCode === null && browser.signalCode === null)
          await new Promise((resolve) => browser.once("exit", resolve));
      }
      const failures = [];
      if (composeStarted) {
        try {
          compose("down", "--volumes", "--remove-orphans");
        } catch {
          failures.push("isolated Docker project");
        }
      }
      failures.push(...(await users.cleanup()));
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      assert.deepEqual(failures, [], "Cleanup failed; remove the listed resources manually");
    }
  },
);
