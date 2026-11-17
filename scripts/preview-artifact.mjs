import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Run only on a fresh runner where no process from the PR build can alter these files.
try {
  if (process.argv.length !== 4 || process.argv[3] !== "--validate-only") throw new Error();
  const root = process.argv[2];
  const files = [];
  let total = 0;
  let entries = 0;
  function visit(path, relative = "") {
    if (++entries > 2000 || relative.length > 512 || relative.split("/").length > 16) throw new Error();
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error();
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) {
        if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(name)) throw new Error();
        visit(join(path, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 10 * 1024 * 1024) throw new Error();
    if (!/^(server\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.js|client\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+)$/.test(relative)) throw new Error();
    total += stat.size;
    if (total > 50 * 1024 * 1024 || files.length >= 1000) throw new Error();
    const data = readFileSync(path);
    if (data.length !== stat.size) throw new Error();
    files.push({ path: relative, size: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  }
  visit(root);
  if (!files.some((file) => file.path === "server/index.js")) throw new Error();
  process.stdout.write(`${JSON.stringify(files.sort((a, b) => a.path.localeCompare(b.path)))}\n`);
} catch {
  process.stderr.write("Preview artifact rejected.\n");
  process.exitCode = 1;
}
