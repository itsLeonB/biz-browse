import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChrome } from "./admin-browser-support.mjs";

const chrome = process.env.CHROME_BIN;
test(
  "admin keeps edits and reports photo and refresh failures correctly",
  { skip: !chrome && "Set CHROME_BIN to run the browser test", timeout: 30000 },
  async () => {
    const bundle = await build({
      stdin: {
        contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {Route} from './src/routes/admin.tsx'; createRoot(document.getElementById('root')).render(React.createElement(Route.component));`,
        resolveDir: process.cwd(),
        loader: "jsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      plugins: [
        {
          name: "route-stubs",
          setup(build) {
            build.onResolve({ filter: /auth\.server$/ }, () => ({
              path: "auth",
              namespace: "stub",
            }));
            build.onResolve(
              { filter: /^@tanstack\/react-(router|start)$|^@clerk\/tanstack-react-start$/ },
              (args) => ({ path: args.path, namespace: "stub" }),
            );
            build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
              contents:
                args.path === "auth"
                  ? "export const isAdmin = () => true;"
                  : args.path.includes("router")
                    ? "export const createFileRoute = () => options => options; export const redirect = () => {};"
                    : args.path.includes("clerk")
                      ? "export const UserButton = () => null;"
                      : "export const createServerFn = () => ({handler: () => {}});",
              loader: "js",
            }));
          },
        },
      ],
    });
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html");
      res.end(
        req.url === "/bundle.js"
          ? bundle.outputFiles[0].text
          : '<div id="root"></div><script src="/bundle.js"></script>',
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const dir = await mkdtemp(join(tmpdir(), "admin-races-"));
    let browser, socket;
    try {
      browser = await startChrome(chrome, [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=0",
        `--user-data-dir=${dir}`,
        "about:blank",
      ]);
      let port;
      for (let i = 0; i < 100 && !port; i++) {
        try {
          port = (await readFile(join(dir, "DevToolsActivePort"), "utf8")).split("\n")[0];
        } catch {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      assert.ok(port, "Chrome did not start");
      const [page] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      let id = 0;
      const pending = new Map();
      socket.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      };
      const call = (method, params = {}) =>
        new Promise((resolve) => {
          const n = ++id;
          pending.set(n, resolve);
          socket.send(JSON.stringify({ id: n, method, params }));
        });
      const mock = `window.calls=[]; window.listings=[{id:'a',business_name:'A',published:false},{id:'b',business_name:'B',published:false}]; window.photoError=null; window.failRefresh=false; window.fetch=async (url,opts={})=>{ calls.push([url,opts.method]); if(url==='/api/drafts' && opts.method==='POST') return await new Promise(r=>window.finishSave=()=>r(new Response(JSON.stringify({id:'a'})))); if(url==='/api/drafts') return failRefresh ? new Response('',{status:500}) : Response.json({listings,categories:[],cities:[]}); if(url.startsWith('/api/photos?')) return Response.json([{id:'photo'}]); if(url==='/api/photos/photo') return photoError ? new Response(JSON.stringify(photoError.body),{status:photoError.status}) : new Response(null,{status:204}); if(url.endsWith('/publish')) { listings[0].published=true; return new Response(null,{status:204}); } return new Response(null,{status:204}); };`;
      await call("Page.enable");
      await call("Page.addScriptToEvaluateOnNewDocument", { source: mock });
      await call("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
      const script = `(async () => {
      const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('timeout '+document.body.innerText+' calls='+JSON.stringify(window.calls))};
      const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(text));
      const status=text=>document.body.textContent.includes(text);
      await wait(()=>button('A (pribadi)')); button('A (pribadi)').click(); await wait(()=>button('Hapus foto'));
      photoError={status:409,body:{code:'LAST_PUBLISHED_PHOTO'}}; button('Hapus foto').click(); await wait(()=>status('Foto terakhir listing publik'));
      photoError={status:409,body:{code:'OTHER'}}; button('Hapus foto').click(); await wait(()=>status('Foto tidak dapat dihapus.'));
      photoError={status:404,body:{}}; button('Hapus foto').click(); await wait(()=>!button('Hapus foto'));
      const input=document.querySelector('#business_name'); input.value='Unsaved edit';
      button('Simpan draf').click(); await wait(()=>window.finishSave); const locked=button('B (pribadi)').disabled;
      input.value='Edit while saving'; finishSave(); await wait(()=>status('Listing tersimpan.'));
      const preserved=document.querySelector('#business_name').value;
      failRefresh=true; button('Terbitkan listing tersimpan').click(); await wait(()=>status('Daftar tidak dapat dimuat ulang'));
      return {locked,preserved,published:status('Listing diterbitkan.'),disabled:button('Tarik listing dari publik').disabled,validation:status('Tidak dapat menerbitkan.')};
    })()`;
      const result = await call("Runtime.evaluate", {
        expression: script,
        awaitPromise: true,
        returnByValue: true,
      });
      assert.equal(
        result.result.exceptionDetails,
        undefined,
        JSON.stringify(result.result.exceptionDetails),
      );
      assert.deepEqual(result.result.result.value, {
        locked: true,
        preserved: "Edit while saving",
        published: true,
        disabled: true,
        validation: false,
      });
    } finally {
      socket?.close();
      if (browser) {
        browser.kill();
        if (browser.exitCode === null && browser.signalCode === null)
          await new Promise((resolve) => browser.once("exit", resolve));
      }
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
