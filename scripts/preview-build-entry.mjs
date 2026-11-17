import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

try {
  if (![5, 6].includes(process.argv.length)) throw new Error();
  const [, , eventPath, mappings, repository, keyFile] = process.argv;
  if (keyFile) rmSync(keyFile, { force: true });
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const pr = event.pull_request;
  if (
    !["opened", "reopened", "synchronize"].includes(event.action) ||
    !Number.isSafeInteger(event.number) || event.number < 1 ||
    !pr || pr.number !== event.number || pr.state !== "open" ||
    !["OWNER", "MEMBER", "COLLABORATOR"].includes(pr.author_association) ||
    event.repository?.full_name !== repository ||
    pr.base?.repo?.full_name !== repository ||
    pr.head?.repo?.full_name !== repository ||
    pr.base.ref !== event.repository.default_branch ||
    !/^[a-f0-9]{40}$/.test(pr.head.sha)
  ) throw new Error();

  const id = `pr-${event.number}`;
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./preview-config.mjs", import.meta.url)),
    join(mappings, `${id}.json`),
    id,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error();
  if (keyFile) {
    const mapping = JSON.parse(readFileSync(join(mappings, `${id}.json`), "utf8"));
    writeFileSync(keyFile, mapping.clerk_publishable_key, { flag: "wx" });
  }
  process.stdout.write(result.stdout);
} catch {
  process.stderr.write("Preview build rejected: untrusted PR or invalid mapping.\n");
  process.exitCode = 1;
}
