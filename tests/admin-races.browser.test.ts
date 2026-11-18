import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";

test("admin keeps edits and reports photo and refresh failures correctly", async ({ page }) => {
  test.setTimeout(30_000);
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
            {
              filter: /^@tanstack\/react-(router|start)$|^@clerk\/tanstack-react-start$/,
            },
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
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const mock = `window.confirm=()=>true; window.calls=[]; window.listings=[{id:'a',business_name:'A',published:false},{id:'b',business_name:'B',published:false}]; window.photoError=null; window.uploadCount=0; window.photos=[{id:'photo'},{id:'other'}]; window.failRefresh=false; window.fetch=async (url,opts={})=>{ calls.push([url,opts.method]); if(url==='/api/drafts' && opts.method==='POST') return await new Promise(r=>window.finishSave=()=>r(new Response(JSON.stringify({id:'a'})))); if(url==='/api/drafts') return failRefresh ? new Response('',{status:500}) : Response.json({listings,categories:[],cities:[]}); if(url.startsWith('/api/photos?')) { const snapshot=photos.slice(); if(window.delayPhotos) { window.delayPhotos=false; return await new Promise(r=>window.finishPhotos=()=>r(Response.json(snapshot))); } return Response.json(snapshot); } if(url==='/api/photos' && opts.method==='POST') { if(window.failUpload) return new Response(null,{status:500}); photos.push({id:'uploaded'+(++window.uploadCount)}); return new Response(null,{status:204}); } if(url==='/api/photos/photo') { if(photoError?.status===404 || !photoError) photos=photos.filter(p=>p.id!=='photo'); return photoError ? new Response(JSON.stringify(photoError.body),{status:photoError.status}) : new Response(null,{status:204}); } if(url.endsWith('/publish')) { listings[0].published=true; return new Response(null,{status:204}); } return new Response(null,{status:204}); };`;
    await page.addInitScript({ content: mock });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const script = `(async () => {
      const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('timeout '+document.body.innerText+' calls='+JSON.stringify(window.calls))};
      const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(text));
      const status=text=>document.body.textContent.includes(text);
      await wait(()=>button('A (pribadi)')); button('A (pribadi)').click(); await wait(()=>button('Hapus foto'));
      window.confirm=()=>false; button('Hapus foto').click(); await new Promise(r=>setTimeout(r,50));
      const cancelledDelete=!window.calls.some(([,method])=>method==='DELETE'); window.confirm=()=>true;
      const labels=Array.from(document.querySelectorAll('#photos-heading + ul button'),b=>b.getAttribute('aria-label') || b.textContent);
      window.delayPhotos=true; const file=document.querySelector('#photo'); const files=new DataTransfer(); files.items.add(new File(['x'],'x.png',{type:'image/png'})); file.files=files.files;
      button('Unggah foto').click(); await wait(()=>window.finishPhotos);
      photoError={status:409,body:{code:'LAST_PUBLISHED_PHOTO'}}; button('Hapus foto').click(); await wait(()=>status('Foto terakhir listing publik'));
      photoError={status:409,body:{code:'OTHER'}}; button('Hapus foto').click(); await wait(()=>status('Foto tidak dapat dihapus.'));
      photoError={status:404,body:{}}; button('Hapus foto').click(); await wait(()=>!document.querySelector('img[src="/api/photos/photo"]'));
      finishPhotos(); await wait(()=>status('Foto tersimpan.') && !button('Unggah foto').disabled); const stalePhoto=!!document.querySelector('img[src="/api/photos/photo"]');
      const selectFile=()=>{const selection=new DataTransfer(); selection.items.add(new File(['x'],'x.png',{type:'image/png'})); file.files=selection.files};
      window.finishPhotos=null; window.delayPhotos=true; selectFile(); button('Unggah foto').click(); await wait(()=>window.finishPhotos);
      const uploadButton=button('Unggah foto'); const uploadDisabled=uploadButton.disabled;
      selectFile(); uploadButton.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      await new Promise(r=>setTimeout(r,50)); const duplicateBlocked=window.uploadCount===2;
      finishPhotos(); await wait(()=>!uploadButton.disabled);
      selectFile(); uploadButton.click(); await wait(()=>document.querySelector('img[src="/api/photos/uploaded3"]'));
      const uploaded=!!document.querySelector('img[src="/api/photos/uploaded3"]');
      await wait(()=>!uploadButton.disabled); window.failUpload=true; selectFile(); uploadButton.click();
      await wait(()=>status('Foto tidak dapat diunggah.')); const uploadRetryEnabled=!uploadButton.disabled;
      const input=document.querySelector('#business_name'); input.value='Unsaved edit';
      button('Simpan draf').click(); await wait(()=>window.finishSave); const locked=button('B (pribadi)').disabled;
      input.value='Edit while saving'; input.dispatchEvent(new Event('input',{bubbles:true})); finishSave(); await wait(()=>!button('Simpan draf').disabled);
      const preserved=input.value, dirty=status('belum tersimpan'), blocked=button('Terbitkan listing tersimpan').disabled;
      window.confirm=()=>false; button('Draf baru').click();
      await new Promise(resolve=>setTimeout(resolve,0));
      const cancelledDiscard=document.querySelector('#business_name').value==='Edit while saving'; window.confirm=()=>true;
      window.finishSave=null; button('Simpan draf').click(); await wait(()=>window.finishSave); finishSave(); await wait(()=>status('Listing tersimpan.'));
      failRefresh=true; button('Terbitkan listing tersimpan').click(); await wait(()=>status('Daftar tidak dapat dimuat ulang'));
      const published=status('Listing diterbitkan.'), disabled=button('Tarik listing dari publik').disabled, validation=status('Tidak dapat menerbitkan.');
      button('Tarik listing dari publik').click(); await wait(()=>status('Listing tidak lagi publik.'));
      return {cancelledDelete,cancelledDiscard,labels,stalePhoto,uploadDisabled,duplicateBlocked,uploaded,uploadRetryEnabled,locked,preserved,dirty,blocked,published,disabled,validation};
    })()`;
    const result = await page.evaluate(script);
    assert.deepEqual(result, {
      cancelledDelete: true,
      cancelledDiscard: true,
      labels: ["Hapus foto 1", "Hapus foto 2"],
      stalePhoto: false,
      uploadDisabled: true,
      duplicateBlocked: true,
      uploaded: true,
      uploadRetryEnabled: true,
      locked: true,
      preserved: "Edit while saving",
      dirty: true,
      blocked: true,
      published: true,
      disabled: false,
      validation: false,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
