import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Run on a fresh isolated runner with trusted scripts, event, mapping and credentials.
function runGate() {
  const gate = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./preview-deploy-gate.mjs", import.meta.url))],
    { encoding: "utf8" },
  );
  if (gate.status !== 0) throw new Error();
}

try {
  if (process.argv.length !== 7) throw new Error();
  const [, , eventPath, mappings, repository, artifact, assetManifestPath] = process.argv;
  const run = (script, args) => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(script, import.meta.url)), ...args],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error();
    return JSON.parse(result.stdout);
  };
  runGate();
  const config = run("./preview-build-entry.mjs", [eventPath, mappings, repository]);
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const mappingBytes = readFileSync(join(mappings, `pr-${event.number}.json`));
  if (
    createHash("sha256").update(mappingBytes).digest("hex") !==
    JSON.parse(process.env.PREVIEW_IDENTITY).mapping_sha256
  )
    throw new Error();
  const trustedMapping = JSON.parse(mappingBytes);
  const mapping = trustedMapping.preview;
  const manifest = run("./preview-artifact.mjs", [artifact, "--validate-only"]);
  const manifestBytes = readFileSync(assetManifestPath);
  if (
    manifestBytes.length > 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(process.env.PREVIEW_MANIFEST_SHA256 ?? "") ||
    createHash("sha256").update(manifestBytes).digest("hex") !== process.env.PREVIEW_MANIFEST_SHA256
  )
    throw new Error();
  const packaged = JSON.parse(manifestBytes);
  if (
    !packaged ||
    typeof packaged !== "object" ||
    Array.isArray(packaged) ||
    JSON.stringify(packaged.files) !== JSON.stringify(manifest) ||
    !packaged.hashes ||
    typeof packaged.hashes !== "object" ||
    Array.isArray(packaged.hashes)
  )
    throw new Error();
  const assetPaths = manifest
    .filter((file) => file.path.startsWith("client/"))
    .map((file) => file.path);
  if (
    Object.keys(packaged.hashes).length !== assetPaths.length ||
    assetPaths.some(
      (path) =>
        !Object.hasOwn(packaged.hashes, path) ||
        typeof packaged.hashes[path] !== "string" ||
        !/^[a-f0-9]{32}$/.test(packaged.hashes[path]),
    )
  )
    throw new Error();
  const files = manifest.map((file) => {
    const data = readFileSync(join(artifact, file.path));
    if (
      data.length !== file.size ||
      createHash("sha256").update(data).digest("hex") !== file.sha256
    )
      throw new Error();
    return { path: file.path, data };
  });
  const {
    NEON_API_KEY: neonKey,
    CLOUDFLARE_API_TOKEN: cloudflareKey,
    CLOUDFLARE_ACCOUNT_ID: account,
  } = process.env;
  if (
    !neonKey ||
    !cloudflareKey ||
    !/^[a-f0-9]{32}$/.test(account ?? "") ||
    account !== trustedMapping.cloudflare_account_id
  )
    throw new Error();
  const neon = new URL(
    `https://console.neon.tech/api/v2/projects/${mapping.project}/connection_uri`,
  );
  neon.search = new URLSearchParams({
    branch_id: mapping.branch,
    database_name: mapping.database,
    role_name: mapping.role,
  });
  const response = await fetch(neon, { headers: { Authorization: `Bearer ${neonKey}` } });
  if (!response.ok) throw new Error();
  const { uri } = await response.json();
  const databaseUrl = new URL(uri);
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname ||
    !databaseUrl.username ||
    !databaseUrl.password ||
    decodeURIComponent(databaseUrl.pathname.slice(1)) !== mapping.database ||
    decodeURIComponent(databaseUrl.username) !== mapping.role
  )
    throw new Error();

  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
  const script = `${base}/scripts/${mapping.worker}`;
  const cf = async (url, options, token = cloudflareKey) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const body = await res.json();
    if (body.success !== true || !body.result) throw new Error();
    return body.result;
  };
  const assets = files.filter((file) => file.path.startsWith("client/"));
  const assetManifest = {};
  const byHash = new Map();
  const contentTypes = {
    js: "text/javascript",
    css: "text/css",
    html: "text/html",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    txt: "text/plain",
    map: "application/json",
  };
  for (const file of assets) {
    const name = file.path.slice(7);
    const hash = packaged.hashes[file.path];
    const existing = byHash.get(hash);
    if (existing && !existing.data.equals(file.data)) throw new Error();
    assetManifest[`/${name}`] = { hash, size: file.data.length };
    byHash.set(hash, {
      data: file.data,
      type: contentTypes[extname(name).slice(1).toLowerCase()] ?? "application/octet-stream",
    });
  }
  const session = await cf(`${script}/assets-upload-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest: assetManifest }),
  });
  if (typeof session.jwt !== "string" || !Array.isArray(session.buckets)) throw new Error();
  const parts = session.jwt.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error();
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error();
  if (claims.wrangler_single_asset_uploads === true) {
    process.stderr.write("Preview deployment rejected: single-asset uploads are not supported.\n");
    process.exit(1);
  }
  if (
    claims.wrangler_single_asset_uploads !== undefined &&
    claims.wrangler_single_asset_uploads !== false
  )
    throw new Error();
  let jwt = session.buckets.length ? null : session.jwt;
  for (const bucket of session.buckets) {
    if (!Array.isArray(bucket)) throw new Error();
    const form = new FormData();
    for (const hash of bucket) {
      if (!byHash.has(hash)) throw new Error();
      const file = byHash.get(hash);
      form.append(hash, new Blob([file.data.toString("base64")], { type: file.type }), hash);
    }
    const result = await cf(
      `${base}/assets/upload?base64=true`,
      { method: "POST", body: form },
      session.jwt,
    );
    if (result.jwt) jwt = result.jwt;
  }
  if (typeof jwt !== "string" || !jwt) throw new Error();
  const form = new FormData();
  const metadata = {
    main_module: "index.js",
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    observability: config.observability,
    bindings: [
      { type: "r2_bucket", name: "PHOTOS", bucket_name: mapping.bucket },
      { type: "secret_text", name: "DATABASE_URL", text: uri },
      { type: "inherit", name: "CLERK_SECRET_KEY" },
      { type: "inherit", name: "ADMIN_USER_IDS" },
      { type: "assets", name: "ASSETS" },
    ],
    assets: { jwt },
  };
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  for (const file of files.filter((file) => file.path.startsWith("server/"))) {
    form.append(
      file.path.slice(7),
      new Blob([file.data], { type: "application/javascript+module" }),
      file.path.slice(7),
    );
  }
  runGate();
  await cf(`${script}?bindings_inherit=strict`, { method: "PUT", body: form });
  process.stdout.write("Preview Worker uploaded.\n");
} catch {
  process.stderr.write("Preview deployment rejected or provider request failed.\n");
  process.exitCode = 1;
}
