import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const assets = await readdir("dist/client/assets").catch(() => []);
const stylesheet = assets.find((name) => /^styles-.*\.css$/.test(name));
const listing = {
  id: "10000000-0000-4000-8000-000000000001",
  business_name: "Warung Mawar Uji",
  category: "Kuliner",
  city: "Bandung",
  asking_price: "100000000",
  description: "Bisnis kuliner yang dijual oleh pemilik.",
  price_includes: "Peralatan dan persediaan",
  price_excludes: "Properti",
  address: "Jalan Mawar, Bandung",
  whatsapp: "628123456701",
  photos: ["photo"],
  photo: "photo",
  revenue_amount: "20000000",
  revenue_period: "per bulan",
  revenue_meaning: "Pendapatan kotor",
  profit_amount: null,
};
const directory = {
  listings: [
    listing,
    {
      ...listing,
      id: "second",
      business_name: "Bisnis".repeat(60),
      photo: null,
    },
  ],
  categories: [{ id: "2", name: "Kuliner" }],
  cities: [{ id: "2", name: "Bandung" }],
};

test("pages reflow, expose named controls, and pass axe with fixture data", async ({ page }) => {
  test.setTimeout(60_000);
  if (!stylesheet) throw new Error("Run npm run build before UI checks");
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {Route as shell} from './src/routes/__root.tsx';
          import {Route as directory} from './src/routes/index.tsx';
          import {Route as detail} from './src/routes/listings.$listingId.tsx';
          import {Route as admin} from './src/routes/admin.tsx';
          import {Route as signIn} from './src/routes/sign-in.$.tsx';
          const page=new URLSearchParams(location.search).get('page');
          const route=({directory,detail,admin,signIn,notFound:{component:shell.notFoundComponent}})[page] || directory;
          createRoot(document).render(React.createElement(shell.shellComponent, null, React.createElement(route.component)));`,
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
        name: "fixture-transport",
        setup(build) {
          build.onResolve(
            {
              filter:
                /\.server$|\.css\?url$|^@tanstack\/react-(router|start)$|^@clerk\/tanstack-react-start$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents: args.path.endsWith(".css?url")
              ? 'export default "/styles.css";'
              : args.path.includes("router")
                ? `export const createRootRoute=o=>o;
                    export const createFileRoute=path=>o=>({...o,useLoaderData:()=>path==='/'?window.directory:window.listing,useSearch:()=>({})});
                    export const redirect=()=>{}; export const notFound=()=>{};
                    export const HeadContent=()=>React.createElement('link',{rel:'stylesheet',href:'/styles.css'});
                    export const Outlet=()=>null; export const Scripts=()=>null;
                    export const Link=({to,activeOptions,reloadDocument,...props})=>React.createElement('a',{href:to,...props});
                    import React from 'react';`
                : args.path.includes("clerk")
                  ? `import React from 'react'; export const ClerkProvider=({children})=>children; export const UserButton=()=>null;
                      export const SignIn=()=>React.createElement('p',null,'Formulir masuk disediakan oleh Clerk.');`
                  : args.path.includes("start")
                    ? "export const createServerFn=()=>({validator(){return this},handler(){return this}});"
                    : "export const isAdmin=()=>true;",
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const css = await readFile(join("dist/client/assets", stylesheet));
  const require = createRequire(import.meta.url);
  const axe = await readFile(require.resolve("axe-core/axe.min.js"));
  const server = createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
    } else if (req.url === "/styles.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css);
    } else if (req.url === "/axe.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(axe);
    } else if (req.url === "/api/drafts") {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST") {
        setTimeout(() => res.end(JSON.stringify({ id: listing.id })), 500);
      } else {
        res.end(JSON.stringify(directory));
      }
    } else if (req.url === "/api/photos/photo") {
      res.setHeader("Content-Type", "image/png");
      res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmWQAAAAASUVORK5CYII=",
          "base64",
        ),
      );
    } else if (req.url?.startsWith("/api/photos")) {
      res.setHeader("Content-Type", "application/json");
      res.end("[]");
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>window.directory=${JSON.stringify(req.url?.includes("page=empty") ? { ...directory, listings: [] } : req.url?.includes("page=invalid") ? null : directory)};window.listing=${JSON.stringify(listing)};</script><script src="/bundle.js"></script></body></html>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const retry = async (fn: () => Promise<unknown>) => {
    for (let i = 0; i < 100; i++) {
      const value = await fn().catch(() => null);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Browser did not reach expected state");
  };
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const evaluate = (expression: string) => page.evaluate(expression);
    for (const name of ["directory", "detail", "admin", "signIn", "empty", "invalid", "notFound"]) {
      await page.goto(`http://127.0.0.1:${address.port}/?page=${name}`);
      await retry(() =>
        evaluate(
          "!!document.querySelector('main h1') && getComputedStyle(document.body).lineHeight !== 'normal'",
        ),
      );
      if (name === "admin")
        await retry(() => evaluate("!!document.querySelector('.draft-list button')"));
      assert.equal(await evaluate("document.querySelectorAll('main').length"), 1);
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await evaluate("document.documentElement.scrollWidth <= innerWidth"),
          true,
          `${name}: overflow at ${width}px: ${JSON.stringify(await evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,8).map(e=>({tag:e.tagName,cls:e.className}))"))}`,
        );
      }
      await page.setViewportSize({ width: 375, height: 900 });
      await evaluate(
        "new Promise(resolve=>{const s=document.createElement('script');s.src='/axe.js';s.onload=resolve;document.head.append(s)})",
      );
      await evaluate(
        "Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))",
      );
      const violations = await evaluate(
        "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))",
      );
      assert.deepEqual(violations, [], `${name}: accessibility failures`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (name === "admin") {
        await evaluate("document.querySelector('form button[type=submit]').click()");
        await retry(() => evaluate("!!document.querySelector('[data-slot=spinner]')"));
        assert.equal(
          await evaluate(
            "getComputedStyle(document.querySelector('[data-slot=spinner]')).animationName",
          ),
          "none",
          "save indicator respects reduced motion",
        );
        assert.equal(
          await evaluate("document.querySelector('form button[type=submit]').disabled"),
          true,
          "saving disables duplicate submits",
        );
        await retry(() => evaluate("!document.querySelector('form button[type=submit]').disabled"));
      }
      await evaluate(
        "document.activeElement?.blur(); document.querySelector('.skip-link').focus()",
      );
      await page.keyboard.press("Enter");
      assert.equal(
        await evaluate("document.activeElement.id"),
        "main-content",
        `${name}: skip link target`,
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
