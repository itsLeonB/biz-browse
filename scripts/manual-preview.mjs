import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNeonTargets } from "./preview-mapping-targets.mjs";

let temporary;
try {
  if (process.argv.length !== 5) throw new Error();
  const [, , id, approvedCommit, artifactArg] = process.argv;
  if (!/^pr-[1-9][0-9]*$/.test(id) || !/^[a-f0-9]{40}$/.test(approvedCommit)) throw new Error();
  const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  const git = (args) => {
    const result = spawnSync("git", args, {
      encoding: "utf8",
      env: safeEnv,
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) throw new Error();
    return result.stdout;
  };
  if (git(["rev-parse", "refs/remotes/origin/main"]).trim() !== approvedCommit) throw new Error();
  const envelope = JSON.parse(
    git(["show", `${approvedCommit}:.github/manual-preview-mappings/${id}.json`]),
  );
  if (
    Object.keys(envelope).sort().join() !== "cloudflare_account_id,mapping" ||
    !/^[a-f0-9]{32}$/.test(envelope.cloudflare_account_id)
  )
    throw new Error();
  temporary = mkdtempSync(join(tmpdir(), "manual-preview-"));
  const mappingPath = join(temporary, "mapping.json");
  writeFileSync(mappingPath, JSON.stringify(envelope.mapping), { mode: 0o600 });
  const checked = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./preview-config.mjs", import.meta.url)), mappingPath, id],
    { encoding: "utf8", env: safeEnv },
  );
  if (checked.status !== 0) throw new Error();
  const config = JSON.parse(checked.stdout);
  const paths = git([
    "ls-tree",
    "-r",
    "--full-tree",
    approvedCommit,
    "--",
    ".github/preview-mappings/",
    ".github/manual-preview-mappings/",
  ])
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!paths.length || paths.length > 20) throw new Error();
  const mappings = [];
  for (const line of paths) {
    const match =
      /^100644 blob [a-f0-9]{40}\t(\.github\/(manual-preview-mappings|preview-mappings)\/(pr-[1-9][0-9]*)\.json)$/.exec(
        line,
      );
    if (!match) throw new Error();
    const data = JSON.parse(git(["show", `${approvedCommit}:${match[1]}`]));
    if (
      match[2] === "manual-preview-mappings" &&
      (Object.keys(data).sort().join() !== "cloudflare_account_id,mapping" ||
        !/^[a-f0-9]{32}$/.test(data.cloudflare_account_id))
    )
      throw new Error();
    const candidate = match[2] === "manual-preview-mappings" ? data.mapping : data;
    const validation = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./preview-config.mjs", import.meta.url)), "-", match[3]],
      { input: JSON.stringify(candidate), encoding: "utf8", env: safeEnv },
    );
    if (validation.status !== 0) throw new Error();
    mappings.push(candidate);
  }
  if (!paths.some((line) => line.endsWith(`\t.github/manual-preview-mappings/${id}.json`)))
    throw new Error();
  checkNeonTargets(mappings);
  const mapping = envelope.mapping.preview;
  const defaults = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  if (
    mapping.worker === defaults.name ||
    defaults.r2_buckets.some((bucket) => bucket.bucket_name === mapping.bucket)
  )
    throw new Error();
  const artifact = resolve(artifactArg);
  const validated = spawnSync(
    process.execPath,
    [new URL("./preview-artifact.mjs", import.meta.url).pathname, artifact, "--validate-only"],
    { encoding: "utf8", env: safeEnv },
  );
  if (validated.status !== 0) throw new Error();
  const { NEON_API_KEY: neonKey, CLOUDFLARE_API_TOKEN: cloudflareKey } = process.env;
  if (!neonKey || !cloudflareKey) throw new Error();
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
  const database = new URL(uri);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    !database.password ||
    decodeURIComponent(database.username) !== mapping.role ||
    decodeURIComponent(database.pathname.slice(1)) !== mapping.database
  )
    throw new Error();
  const configPath = join(temporary, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: mapping.worker,
      account_id: envelope.cloudflare_account_id,
      main: join(artifact, "server/index.js"),
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      r2_buckets: config.r2_buckets,
      assets: { directory: join(artifact, "client"), binding: "ASSETS" },
    }),
    { mode: 0o600 },
  );
  const env = {
    ...safeEnv,
    CLOUDFLARE_API_TOKEN: cloudflareKey,
    CLOUDFLARE_ACCOUNT_ID: envelope.cloudflare_account_id,
    WRANGLER_SEND_METRICS: "false",
  };
  const wrangler = (args, input) => {
    if (git(["rev-parse", "refs/remotes/origin/main"]).trim() !== approvedCommit) throw new Error();
    const result = spawnSync(
      "wrangler",
      [...args, "--config", configPath, "--name", mapping.worker],
      { input, env, cwd: temporary, stdio: ["pipe", "ignore", "ignore"] },
    );
    if (result.status !== 0) throw new Error();
  };
  wrangler(["secret", "put", "DATABASE_URL"], `${uri}\n`);
  wrangler(["deploy"]);
  process.stdout.write("Preview Worker uploaded.\n");
} catch {
  process.stderr.write("Manual preview rejected or provider request failed.\n");
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
