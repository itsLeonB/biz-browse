import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("unpacks bounded build data and rejects unsafe archives before extraction", () => {
  const root = mkdtempSync(join(tmpdir(), "preview-zip-"));
  try {
    for (const kind of ["valid", "traversal", "symlink", "large"]) {
      const archive = join(root, `${kind}.zip`);
      const target = join(root, kind);
      const fixture = spawnSync("python3", [
        "-c",
        `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('server/index.js', 'export default {}')
    if sys.argv[2] == 'traversal': z.writestr('../escape', 'bad')
    if sys.argv[2] == 'symlink':
        info = zipfile.ZipInfo('client/link')
        info.create_system = 3
        info.external_attr = 0o120777 << 16
        z.writestr(info, '/etc/passwd')
    if sys.argv[2] == 'large': z.writestr('client/large', b'x' * (10 * 1024 * 1024 + 1))
`,
        archive,
        kind,
      ]);
      assert.equal(fixture.status, 0);
      const result = spawnSync("python3", ["scripts/preview-unpack.py", archive, target]);
      if (kind === "valid") {
        assert.equal(result.status, 0, result.stderr.toString());
        assert.equal(readFileSync(join(target, "server/index.js"), "utf8"), "export default {}");
      } else {
        assert.notEqual(result.status, 0, kind);
        assert.equal(existsSync(target), false, kind);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
