import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChrome } from "./admin-browser-support.mjs";
import { cdp, waitForSocket } from "./browser-support.mjs";

const chrome = process.env.CHROME_BIN;

test(
  "buyer filters the directory and opens a listing",
  { skip: !chrome && "Set CHROME_BIN to run the browser journey" },
  async () => {
    const profile = await mkdtemp(join(tmpdir(), "directory-browser-"));
    let browser;
    let socket;
    try {
      browser = await startChrome(chrome, [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ]);
      const retry = async (fn) => {
        for (let i = 0; i < 100; i++) {
          try {
            const result = await fn();
            if (result) return result;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("Browser did not reach expected state");
      };
      const port = await retry(
        async () => (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0],
      );
      const [page] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await waitForSocket(socket);
      const call = cdp(socket);
      const evaluate = async (expression) =>
        (await call("Runtime.evaluate", { expression, returnByValue: true })).result.result.value;
      await call("Page.navigate", { url: process.env.TEST_BASE_URL });
      try {
        await retry(() =>
          evaluate(
            "document.querySelector('#category') && document.body.innerText.includes('Warung Mawar Uji')",
          ),
        );
      } catch (error) {
        throw new Error(
          `Directory did not load: ${await evaluate("location.href + ' ' + document.body.innerText.slice(0, 300)")}`,
          { cause: error },
        );
      }
      await evaluate(
        "document.querySelector('#category').value = '2'; document.querySelector('form').requestSubmit()",
      );
      await retry(() =>
        evaluate(
          "location.search.includes('category=2') && document.body.innerText.includes('Warung Mawar Uji') && !document.body.innerText.includes('Salon Melati Uji')",
        ),
      );
      await evaluate(
        "[...document.querySelectorAll('a')].find(a => a.textContent.includes('Warung Mawar Uji')).click()",
      );
      await retry(() =>
        evaluate(
          "location.pathname === '/listings/10000000-0000-4000-8000-000000000001' && document.querySelector('h1')?.textContent === 'Warung Mawar Uji'",
        ),
      );
      assert.equal(await evaluate("document.querySelector('h1').textContent"), "Warung Mawar Uji");
    } finally {
      socket?.close();
      if (browser) {
        browser.kill();
        if (browser.exitCode === null && browser.signalCode === null)
          await new Promise((resolve) => browser.once("exit", resolve));
      }
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
);
