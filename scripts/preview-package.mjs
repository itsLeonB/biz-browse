import { spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

try {
  if (process.argv.length !== 4) throw new Error();
  const build = resolve(process.argv[2]);
  const artifact = resolve(process.argv[3]);
  const fromBuild = relative(build, artifact);
  if (
    !fromBuild ||
    (fromBuild !== ".." && !fromBuild.startsWith(`..${sep}`) && !isAbsolute(fromBuild))
  )
    throw new Error();
  // Check the whole output before copying, including files that packaging skips.
  let entries = 0;
  let bytes = 0;
  function check(path, depth = 0) {
    if (++entries > 2000 || depth > 16) throw new Error();
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) check(join(path, name), depth + 1);
    } else if (stat.isFile() && stat.nlink === 1) {
      bytes += stat.size;
      if (stat.size > 50 * 1024 * 1024 || bytes > 200 * 1024 * 1024) throw new Error();
    } else throw new Error();
  }
  check(build);
  mkdirSync(artifact);
  function copy(source, target, server) {
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error();
    if (stat.isDirectory()) {
      mkdirSync(target);
      for (const name of readdirSync(source)) copy(join(source, name), join(target, name), server);
    } else if (stat.isFile()) {
      const name = basename(source);
      if (
        name.endsWith(".map") ||
        name === ".assetsignore" ||
        /^wrangler(?:\..*)?\.(jsonc?|toml)$/i.test(name)
      )
        return;
      if (server && !name.endsWith(".js")) throw new Error();
      copyFileSync(source, target);
    } else throw new Error();
  }
  copy(join(build, "server"), join(artifact, "server"), true);
  copy(join(build, "client"), join(artifact, "client"), false);
  const validation = spawnSync(process.execPath, [
    fileURLToPath(new URL("./preview-artifact.mjs", import.meta.url)),
    artifact,
    "--validate-only",
  ]);
  if (validation.status !== 0) throw new Error();
} catch {
  process.stderr.write(
    "Preview packaging failed. Use a new artifact directory and a valid build.\n",
  );
  process.exitCode = 1;
}
