import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { hash as blake3 } from "blake3-wasm";

// Run only in the trusted packaging job, without provider credentials.
try {
  if (process.argv.length !== 3) throw new Error();
  const root = process.argv[2];
  const result = spawnSync(
    process.execPath,
    [new URL("./preview-artifact.mjs", import.meta.url).pathname, root, "--validate-only"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error();
  const files = JSON.parse(result.stdout);
  const hashes = {};
  for (const file of files.filter((file) => file.path.startsWith("client/"))) {
    const data = readFileSync(join(root, file.path));
    if (
      data.length !== file.size ||
      createHash("sha256").update(data).digest("hex") !== file.sha256
    )
      throw new Error();
    hashes[file.path] = blake3(data.toString("base64") + extname(file.path).slice(1))
      .toString("hex")
      .slice(0, 32);
  }
  process.stdout.write(`${JSON.stringify({ files, hashes })}\n`);
} catch {
  process.stderr.write("Preview asset manifest rejected.\n");
  process.exitCode = 1;
}
