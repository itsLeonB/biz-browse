import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chrome = process.env.CHROME_BIN;

test(
  "buyer filters the directory and opens a listing",
  { skip: !chrome && "Set CHROME_BIN to run the browser journey" },
  async () => {
    const profile = await mkdtemp(join(tmpdir(), "directory-browser-"));
    const browser = spawn(
      chrome,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
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
    let socket;
    try {
      const port = await retry(
        async () => (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0],
      );
      const [page] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      let id = 0;
      const pending = new Map();
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (pending.has(message.id)) {
          pending.get(message.id)(message);
          pending.delete(message.id);
        }
      };
      const call = (method, params = {}) =>
        new Promise((resolve) => {
          const requestId = ++id;
          pending.set(requestId, resolve);
          socket.send(JSON.stringify({ id: requestId, method, params }));
        });
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
      browser.kill();
      await new Promise((resolve) => browser.once("exit", resolve));
      await rm(profile, { recursive: true, force: true });
    }
  },
);
