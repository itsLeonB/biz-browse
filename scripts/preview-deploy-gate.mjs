import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

try {
  const expected = JSON.parse(process.env.PREVIEW_IDENTITY);
  const result = spawnSync(
    process.execPath,
    [new URL("./preview-identity.mjs", import.meta.url).pathname],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error();
  const actual = JSON.parse(result.stdout);
  for (const key of [
    "pr",
    "head_sha",
    "source_repository",
    "source_repository_id",
    "workflow_ref",
    "workflow_sha",
    "run_id",
    "run_attempt",
    "mapping_sha256",
  ]) {
    if (actual[key] !== expected[key]) throw new Error();
  }
  const api = async (path) => {
    const response = await fetch(
      `https://api.github.com/repos/${actual.source_repository}${path}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) throw new Error();
    return response.json();
  };
  const repository = await api("");
  const branch = repository.default_branch;
  if (
    repository.id !== actual.source_repository_id ||
    repository.full_name !== actual.source_repository ||
    typeof branch !== "string" ||
    actual.workflow_ref !==
      `${actual.source_repository}/.github/workflows/preview-build.yml@refs/heads/${branch}`
  )
    throw new Error();
  const refPath = `/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
  const ref = await api(refPath);
  const commit = ref.object?.sha;
  if (
    ref.ref !== `refs/heads/${branch}` ||
    ref.object?.type !== "commit" ||
    !/^[a-f0-9]{40}$/.test(commit ?? "")
  )
    throw new Error();
  const tree = await api(`/git/trees/${commit}?recursive=1`);
  if (
    !/^[a-f0-9]{40}$/.test(tree.sha ?? "") ||
    tree.truncated !== false ||
    !Array.isArray(tree.tree)
  )
    throw new Error();
  const prefix = ".github/preview-mappings/";
  const entries = tree.tree.filter((entry) => entry.path?.startsWith(prefix));
  if (!entries.length || entries.length > 20) throw new Error();
  const names = new Set();
  const targets = new Set();
  const liveTargets = new Set();
  for (const entry of entries) {
    const name = entry.path.slice(prefix.length);
    const match = /^(pr-[1-9][0-9]*)\.json$/.exec(name);
    if (
      !match ||
      names.has(name) ||
      entry.type !== "blob" ||
      entry.mode !== "100644" ||
      !/^[a-f0-9]{40}$/.test(entry.sha ?? "")
    )
      throw new Error();
    names.add(name);
    const file = await api(`/contents/${prefix}${name}?ref=${commit}`);
    if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string")
      throw new Error();
    const encoded = file.content.replace(/\n/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw new Error();
    const bytes = Buffer.from(encoded, "base64");
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (
      bytes.length > 1024 * 1024 ||
      file.size !== bytes.length ||
      file.sha !== blob ||
      entry.sha !== blob
    )
      throw new Error();
    const mapping = JSON.parse(bytes);
    if (!/^[a-f0-9]{32}$/.test(mapping.cloudflare_account_id ?? "")) throw new Error();
    const validation = spawnSync(
      process.execPath,
      [new URL("./preview-config.mjs", import.meta.url).pathname, "-", match[1]],
      { input: bytes, encoding: "utf8" },
    );
    if (validation.status !== 0) throw new Error();
    for (const field of ["worker", "bucket"]) {
      const target = `${mapping.cloudflare_account_id}/${field}/${mapping.preview[field]}`;
      const liveTarget = `${mapping.cloudflare_account_id}/${field}/${mapping.live[field]}`;
      if (targets.has(target) || liveTargets.has(target) || targets.has(liveTarget))
        throw new Error();
      targets.add(target);
      liveTargets.add(liveTarget);
    }
    if (
      name === `pr-${actual.pr}.json` &&
      createHash("sha256").update(bytes).digest("hex") !== expected.mapping_sha256
    )
      throw new Error();
  }
  if (!names.has(`pr-${actual.pr}.json`)) throw new Error();
  const [latestRef, latestRepository] = await Promise.all([api(refPath), api("")]);
  if (
    latestRef.ref !== ref.ref ||
    latestRef.object?.type !== "commit" ||
    latestRef.object?.sha !== commit ||
    latestRepository.id !== repository.id ||
    latestRepository.full_name !== repository.full_name ||
    latestRepository.default_branch !== branch
  )
    throw new Error();
} catch {
  process.stderr.write("Preview identity rejected: validation failed.\n");
  process.exitCode = 1;
}
