import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = { id: 123, full_name: "owner/repo", default_branch: "main" };
const event = {
  action: "synchronize",
  number: 7,
  repository: repo,
  pull_request: {
    number: 7,
    state: "open",
    author_association: "MEMBER",
    user: { id: 42 },
    base: { ref: "main", repo },
    head: { sha: "a".repeat(40), repo },
  },
};
let mapping = {
  preview_id: "pr-7",
  cloudflare_account_id: "a".repeat(32),
  clerk_publishable_key: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  preview: {
    project: "project",
    branch: "preview",
    database: "db",
    role: "preview",
    worker: "worker-pr-7",
    bucket: "bucket-pr-7",
  },
  live: {
    project: "project",
    branch: "live",
    database: "db",
    role: "live",
    worker: "worker-live",
    bucket: "bucket-live",
  },
};

test("trusted preview deployment targets mapped resources and fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "preview-deploy-"));
  const mappings = join(dir, "mappings");
  const artifact = join(dir, "artifact");
  const eventPath = join(dir, "event.json");
  const log = join(dir, "requests.jsonl");
  const fake = join(dir, "fake.mjs");
  const assetManifest = join(dir, "asset-manifest.json");
  cpSync("scripts", join(dir, "scripts"), { recursive: true });
  cpSync("wrangler.jsonc", join(dir, "wrangler.jsonc"));
  mkdirSync(mappings);
  mkdirSync(join(artifact, "server"), { recursive: true });
  mkdirSync(join(artifact, "client"));
  writeFileSync(join(artifact, "server/index.js"), "export default {};");
  writeFileSync(join(artifact, "client/app.js"), "client");
  writeFileSync(join(artifact, "client/note.txt"), "abc");
  writeFileSync(
    fake,
    `
    import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    let refReads = 0;
    globalThis.fetch = async (url, options = {}) => {
      url = String(url);
      if (url.startsWith('https://api.github.com/')) {
        const path = new URL(url).pathname;
        const repo = JSON.parse(process.env.FAKE_REPO), pr = JSON.parse(process.env.FAKE_PR);
        const bytes = Buffer.from(process.env.REMOTE_MAPPING && existsSync(process.env.UPLOADED) ? process.env.REMOTE_MAPPING : process.env.FAKE_MAPPING);
        const blob = createHash('sha1').update('blob ' + bytes.length + '\\0').update(bytes).digest('hex');
        const afterUpload = existsSync(process.env.UPLOADED);
        if ((afterUpload && process.env.GITHUB_ERROR) || process.env.EARLY_GITHUB_ERROR) return Response.json({}, { status: 500 });
        if (process.env.FAIL_GATE === (afterUpload ? 'final' : 'initial') &&
            (process.env.FAIL_ENDPOINT === 'tree' ? path.includes('/git/trees/') : path.endsWith('/contents/.github/preview-mappings/pr-8.json'))) return Response.json({}, { status: 500 });
        const otherValue = afterUpload && process.env.LATE_MAPPING ? process.env.LATE_MAPPING : process.env.OTHER_MAPPING;
        const other = otherValue ? JSON.parse(otherValue) : null;
        const otherBytes = Buffer.from(JSON.stringify(other));
        const otherBlob = createHash('sha1').update('blob ' + otherBytes.length + '\\0').update(otherBytes).digest('hex');
        const manualBytes = process.env.MANUAL_MAPPING ? Buffer.from(process.env.MANUAL_MAPPING) : null;
        const manualBlob = manualBytes && createHash('sha1').update('blob ' + manualBytes.length + '\\0').update(manualBytes).digest('hex');
        const additional = Array.from({ length: Number(process.env.EXTRA_MAPPINGS || 0) }, (_, i) => {
          const id = i + 10;
          const base = JSON.parse(process.env.FAKE_MAPPING);
          const item = { ...base, preview_id: 'pr-' + id, preview: { ...base.preview, project: 'project-' + id, worker: 'worker-pr-' + id, bucket: 'bucket-pr-' + id } };
          const content = Buffer.from(JSON.stringify(item));
          const sha = createHash('sha1').update('blob ' + content.length + '\\0').update(content).digest('hex');
          return { path: '.github/preview-mappings/pr-' + id + '.json', content, sha };
        });
        const requested = additional.find((item) => path.endsWith('/contents/' + item.path));
        let value = path.endsWith('/git/trees/' + 'd'.repeat(40)) ? { sha: 'a'.repeat(40), truncated: !!process.env.TRUNCATED_TREE, tree: [
          { type: 'blob', mode: '100644', path: '.github/preview-mappings/pr-7.json', sha: blob },
          ...(other ? [{ type: 'blob', mode: '100644', path: '.github/preview-mappings/pr-8.json', sha: otherBlob }] : []),
          ...(manualBytes ? [{ type: 'blob', mode: '100644', path: '.github/manual-preview-mappings/pr-8.json', sha: manualBlob }] : []),
          ...additional.map(({ path, sha }) => ({ type: 'blob', mode: '100644', path, sha })),
        ] } : path.endsWith('/contents/.github/manual-preview-mappings/pr-8.json') && manualBytes ? { type: 'file', encoding: 'base64', content: manualBytes.toString('base64'), size: manualBytes.length, sha: manualBlob } : requested ? { type: 'file', encoding: 'base64', content: requested.content.toString('base64'), size: requested.content.length, sha: requested.sha } : path.endsWith('/contents/.github/preview-mappings/pr-8.json') && other ? { type: 'file', encoding: 'base64', content: otherBytes.toString('base64'), size: otherBytes.length, sha: otherBlob } : path.endsWith('/repos/owner/repo') ? repo :
          path.endsWith('/git/ref/heads/main') ? { ref: 'refs/heads/main', object: { type: 'commit', sha: (afterUpload && process.env.REF_RACE && ++refReads === 2 ? 'e' : 'd').repeat(40) } } :
          path.endsWith('/contents/.github/preview-mappings/pr-7.json') && new URL(url).searchParams.get('ref') === 'd'.repeat(40) && !(afterUpload && process.env.MISSING_MAPPING) ? { type: 'file', encoding: 'base64', content: bytes.toString('base64'), size: bytes.length, sha: afterUpload && process.env.BAD_BLOB ? 'f'.repeat(40) : blob } :
          path.endsWith('/pulls/7') ? (process.env.NEW_HEAD && existsSync(process.env.UPLOADED) ? { ...pr, head: { ...pr.head, sha: 'c'.repeat(40) } } : pr) :
          path.endsWith('/actions/runs/99/attempts/1') ? { id: 99, run_attempt: 1, event: 'pull_request_target', path: '.github/workflows/preview-build.yml', repository: repo, head_sha: 'b'.repeat(40) } : undefined;
        return Response.json(value ?? {}, { status: value ? 200 : 404 });
      }
      let body;
      if (options.body instanceof FormData) {
        body = {};
        for (const [key, value] of options.body) body[key] = await value.text();
      } else if (options.body) body = JSON.parse(options.body);
      appendFileSync(process.env.FAKE_LOG, JSON.stringify({ url, method: options.method || 'GET', body }) + '\\n');
      if (url.includes('console.neon.tech')) return Response.json(process.env.FAIL_NEON ? {} : { uri: 'postgresql://preview:fake-password@preview.example/db' }, { status: process.env.FAIL_NEON ? 500 : 200 });
      if (url.endsWith('/assets-upload-session')) {
        const expected = { '/app.js': { hash: 'aa6a5a8ee81c0dc560cebd0e98bf2dd3', size: 6 }, '/note.txt': { hash: '70b5408031ff6f55ff45333b760cd94f', size: 3 } };
        if (JSON.stringify(body.manifest) !== JSON.stringify(expected)) return Response.json({ success: false }, { status: 400 });
        return Response.json({ success: true, result: { jwt: 'header.' + Buffer.from(JSON.stringify(process.env.SINGLE_UPLOAD ? { wrangler_single_asset_uploads: true } : {})).toString('base64url') + '.signature', buckets: [[expected['/app.js'].hash, expected['/note.txt'].hash]] } });
      }
      if (url.includes('/assets/upload?')) {
        if (body.aa6a5a8ee81c0dc560cebd0e98bf2dd3 !== 'Y2xpZW50' || body['70b5408031ff6f55ff45333b760cd94f'] !== 'YWJj') return Response.json({ success: false }, { status: 400 });
        writeFileSync(process.env.UPLOADED, 'yes');
        if (process.env.CHANGE_MAPPING) writeFileSync(process.env.PREVIEW_MAPPINGS + '/pr-7.json', process.env.CHANGE_MAPPING);
        return Response.json({ success: true, result: { jwt: 'completion-jwt' } });
      }
      return Response.json({ success: true, result: { id: 'ok' } });
    };
  `,
  );
  const manifest = spawnSync(process.execPath, ["scripts/preview-asset-manifest.mjs", artifact], {
    encoding: "utf8",
  });
  assert.equal(manifest.status, 0, manifest.stderr);
  const spacedRoot = join(dir, "scripts with spaces #1");
  mkdirSync(spacedRoot);
  cpSync("scripts/preview-asset-manifest.mjs", join(spacedRoot, "preview-asset-manifest.mjs"));
  cpSync("scripts/preview-artifact.mjs", join(spacedRoot, "preview-artifact.mjs"));
  symlinkSync(join(process.cwd(), "node_modules"), join(spacedRoot, "node_modules"));
  const spacedManifest = spawnSync(
    process.execPath,
    [join(spacedRoot, "preview-asset-manifest.mjs"), artifact],
    { encoding: "utf8" },
  );
  assert.equal(spacedManifest.status, 0, spacedManifest.stderr);
  assert.deepEqual(JSON.parse(spacedManifest.stdout), JSON.parse(manifest.stdout));
  writeFileSync(assetManifest, manifest.stdout);
  const manifestHash = createHash("sha256").update(manifest.stdout).digest("hex");
  const run = (input = event, extra = {}) => {
    writeFileSync(eventPath, JSON.stringify(input));
    writeFileSync(log, "");
    rmSync(join(dir, "uploaded"), { force: true });
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        fake,
        join(dir, "scripts/preview-deploy-entry.mjs"),
        eventPath,
        mappings,
        "owner/repo",
        artifact,
        assetManifest,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PREVIEW_MANIFEST_SHA256: manifestHash,
          NEON_API_KEY: "fake-neon",
          CLOUDFLARE_API_TOKEN: "fake-cloudflare",
          CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
          FAKE_LOG: log,
          UPLOADED: join(dir, "uploaded"),
          NODE_OPTIONS: `--import=${fake}`,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: "pull_request_target",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "99",
          GITHUB_RUN_ATTEMPT: "1",
          GITHUB_SHA: "b".repeat(40),
          GITHUB_WORKFLOW_SHA: "b".repeat(40),
          GITHUB_WORKFLOW_REF: "owner/repo/.github/workflows/preview-build.yml@refs/heads/main",
          GITHUB_TOKEN: "fake",
          PREVIEW_MAPPINGS: mappings,
          PREVIEW_IDENTITY: JSON.stringify({
            pr: 7,
            head_sha: event.pull_request.head.sha,
            source_repository: "owner/repo",
            source_repository_id: 123,
            workflow_ref: "owner/repo/.github/workflows/preview-build.yml@refs/heads/main",
            workflow_sha: "b".repeat(40),
            run_id: "99",
            run_attempt: "1",
            mapping_sha256: createHash("sha256").update(JSON.stringify(mapping)).digest("hex"),
          }),
          FAKE_REPO: JSON.stringify(repo),
          FAKE_PR: JSON.stringify(event.pull_request),
          FAKE_MAPPING: JSON.stringify(mapping),
          ...extra,
        },
      },
    );
    return {
      result,
      calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse),
    };
  };
  try {
    const mapFile = join(mappings, "pr-7.json");
    writeFileSync(mapFile, JSON.stringify(mapping));
    let { result, calls } = run();
    assert.equal(result.status, 0, result.stderr);
    const other = {
      ...mapping,
      preview_id: "pr-8",
      preview: {
        ...mapping.preview,
        worker: "worker-pr-8",
        bucket: "bucket-pr-8",
        project: "another-project",
      },
      live: { ...mapping.live, worker: "worker-live-8", bucket: "bucket-live-8" },
    };
    for (const field of ["worker", "bucket"]) {
      const duplicate = {
        ...other,
        preview: { ...other.preview, [field]: mapping.preview[field] },
      };
      ({ result, calls } = run(event, { OTHER_MAPPING: JSON.stringify(duplicate) }));
      assert.notEqual(result.status, 0, `shared ${field} must be rejected`);
      assert.equal(calls.length, 0);
    }
    for (const field of ["worker", "bucket"]) {
      for (const conflict of [
        { ...other, live: { ...other.live, [field]: mapping.preview[field] } },
        { ...other, preview: { ...other.preview, [field]: mapping.live[field] } },
      ]) {
        ({ result, calls } = run(event, { OTHER_MAPPING: JSON.stringify(conflict) }));
        assert.notEqual(
          result.status,
          0,
          `preview ${field} matching another live target must be rejected`,
        );
        assert.equal(calls.length, 0);
        ({ result } = run(event, {
          OTHER_MAPPING: JSON.stringify({ ...conflict, cloudflare_account_id: "b".repeat(32) }),
        }));
        assert.equal(result.status, 0, result.stderr);
      }
    }
    for (const conflict of [
      { ...other, preview: { ...other.preview, project: mapping.preview.project } },
      { ...other, live: { ...other.live, branch: mapping.preview.branch } },
      {
        ...other,
        preview: { ...other.preview, project: mapping.live.project, branch: mapping.live.branch },
      },
    ]) {
      ({ result, calls } = run(event, { OTHER_MAPPING: JSON.stringify(conflict) }));
      assert.notEqual(result.status, 0);
      assert.equal(calls.length, 0);
    }
    const manual = {
      cloudflare_account_id: "b".repeat(32),
      mapping: { ...other, cloudflare_account_id: undefined },
    };
    ({ result } = run(event, { MANUAL_MAPPING: JSON.stringify(manual) }));
    assert.equal(result.status, 0, result.stderr);
    manual.mapping.preview = { ...manual.mapping.preview, project: mapping.preview.project };
    ({ result, calls } = run(event, { MANUAL_MAPPING: JSON.stringify(manual) }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    ({ result } = run(event, { OTHER_MAPPING: JSON.stringify(other) }));
    assert.equal(result.status, 0, result.stderr);
    ({ result } = run(event, {
      OTHER_MAPPING: JSON.stringify({
        ...other,
        cloudflare_account_id: "b".repeat(32),
        preview: {
          ...other.preview,
          worker: mapping.preview.worker,
          bucket: mapping.preview.bucket,
        },
      }),
    }));
    assert.equal(result.status, 0, result.stderr);
    for (const extra of [
      { OTHER_MAPPING: JSON.stringify({ ...other, cloudflare_account_id: undefined }) },
      { OTHER_MAPPING: JSON.stringify({ ...other, preview_id: "pr-7" }) },
      { OTHER_MAPPING: JSON.stringify({ ...other, preview: { ...other.preview, bucket: "" } }) },
      { TRUNCATED_TREE: "1" },
      { EARLY_GITHUB_ERROR: "1" },
    ]) {
      ({ result, calls } = run(event, extra));
      assert.notEqual(result.status, 0);
      assert.equal(calls.length, 0);
    }
    ({ result } = run(event, { EXTRA_MAPPINGS: "19" }));
    assert.equal(result.status, 0, result.stderr);
    ({ result, calls } = run(event, { EXTRA_MAPPINGS: "20" }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    for (const gate of ["initial", "final"]) {
      for (const endpoint of ["tree", "mapping"]) {
        ({ result, calls } = run(event, {
          OTHER_MAPPING: JSON.stringify(other),
          FAIL_GATE: gate,
          FAIL_ENDPOINT: endpoint,
        }));
        assert.notEqual(result.status, 0, `${gate} ${endpoint} failure must be rejected`);
        if (gate === "initial") assert.equal(calls.length, 0);
        else {
          assert.ok(calls.some((call) => call.url.includes("/assets/upload?")));
          assert.equal(
            calls.some((call) => call.method === "PUT"),
            false,
          );
        }
      }
    }
    for (const late of [
      { ...other, preview: { ...other.preview, worker: mapping.preview.worker } },
      { ...other, live: { ...other.live, bucket: mapping.preview.bucket } },
    ]) {
      ({ result, calls } = run(event, { LATE_MAPPING: JSON.stringify(late) }));
      assert.notEqual(result.status, 0);
      assert.equal(
        calls.some((call) => call.method === "PUT"),
        false,
      );
    }
    ({ result, calls } = run(event, { CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    const originalMapping = mapping;
    mapping = { ...mapping };
    delete mapping.cloudflare_account_id;
    writeFileSync(mapFile, JSON.stringify(mapping));
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    mapping = originalMapping;
    writeFileSync(mapFile, JSON.stringify(mapping));
    ({ result, calls } = run());
    const neon = new URL(calls[0].url);
    assert.equal(neon.pathname, "/api/v2/projects/project/connection_uri");
    assert.equal(neon.searchParams.get("branch_id"), "preview");
    assert.equal(neon.searchParams.get("database_name"), "db");
    assert.equal(neon.searchParams.get("role_name"), "preview");
    assert.ok(calls[1].url.endsWith("/scripts/worker-pr-7/assets-upload-session"));
    assert.deepEqual(calls[1].body.manifest["/app.js"], {
      hash: "aa6a5a8ee81c0dc560cebd0e98bf2dd3",
      size: 6,
    });
    assert.ok(calls[2].url.endsWith("/assets/upload?base64=true"));
    assert.deepEqual(calls[1].body.manifest["/note.txt"], {
      hash: "70b5408031ff6f55ff45333b760cd94f",
      size: 3,
    });
    assert.equal(calls[2].body.aa6a5a8ee81c0dc560cebd0e98bf2dd3, "Y2xpZW50");
    assert.ok(calls[3].url.endsWith("/scripts/worker-pr-7?bindings_inherit=strict"));
    const metadata = JSON.parse(calls[3].body.metadata);
    assert.equal(metadata.assets.jwt, "completion-jwt");
    assert.deepEqual(metadata.bindings, [
      { type: "r2_bucket", name: "PHOTOS", bucket_name: "bucket-pr-7" },
      {
        type: "secret_text",
        name: "DATABASE_URL",
        text: "postgresql://preview:fake-password@preview.example/db",
      },
      { type: "inherit", name: "CLERK_SECRET_KEY" },
      { type: "inherit", name: "ADMIN_USER_IDS" },
      { type: "assets", name: "ASSETS" },
    ]);
    assert.equal(calls[3].body["index.js"], "export default {};");
    assert.doesNotMatch(result.stdout + result.stderr, /fake-password|fake-neon|fake-cloudflare/);
    for (const input of [
      { ...event, pull_request: { ...event.pull_request, author_association: "CONTRIBUTOR" } },
      {
        ...event,
        pull_request: {
          ...event.pull_request,
          head: { ...event.pull_request.head, repo: { full_name: "fork/repo" } },
        },
      },
    ]) {
      ({ result, calls } = run(input));
      assert.notEqual(result.status, 0);
      assert.equal(calls.length, 0);
    }
    writeFileSync(
      mapFile,
      JSON.stringify({ ...mapping, clerk_publishable_key: "pk_test_YW5vdGhlci5leGFtcGxlJA" }),
    );
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    writeFileSync(mapFile, JSON.stringify(mapping));
    ({ result, calls } = run(event, { PREVIEW_MANIFEST_SHA256: "0".repeat(64) }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    const alteredManifest = JSON.parse(manifest.stdout);
    alteredManifest.hashes["client/app.js"] = "0".repeat(32);
    writeFileSync(assetManifest, JSON.stringify(alteredManifest));
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    alteredManifest.files[0].sha256 = "0".repeat(64);
    const forged = JSON.stringify(alteredManifest);
    writeFileSync(assetManifest, forged);
    ({ result, calls } = run(event, {
      PREVIEW_MANIFEST_SHA256: createHash("sha256").update(forged).digest("hex"),
    }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    const malformed = JSON.parse(manifest.stdout);
    malformed.hashes["client/app.js"] = "invalid";
    const malformedBytes = JSON.stringify(malformed);
    writeFileSync(assetManifest, malformedBytes);
    ({ result, calls } = run(event, {
      PREVIEW_MANIFEST_SHA256: createHash("sha256").update(malformedBytes).digest("hex"),
    }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    writeFileSync(assetManifest, manifest.stdout);
    writeFileSync(join(artifact, "client/app.js"), "changed");
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    writeFileSync(join(artifact, "client/app.js"), "client");
    rmSync(join(artifact, "client/app.js"));
    symlinkSync(join(artifact, "client/note.txt"), join(artifact, "client/app.js"));
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    rmSync(join(artifact, "client/app.js"));
    writeFileSync(join(artifact, "client/app.js"), "client");
    for (const extra of [
      { NEW_HEAD: "1" },
      {
        REMOTE_MAPPING: JSON.stringify({
          ...mapping,
          preview: { ...mapping.preview, bucket: "new-bucket" },
        }),
      },
      { MISSING_MAPPING: "1" },
      { GITHUB_ERROR: "1" },
      { BAD_BLOB: "1" },
      { REF_RACE: "1" },
      {
        CHANGE_MAPPING: JSON.stringify({
          ...mapping,
          preview: { ...mapping.preview, bucket: "new-bucket" },
        }),
      },
    ]) {
      ({ result, calls } = run(event, extra));
      assert.notEqual(result.status, 0);
      assert.equal(
        calls.some((call) => call.method === "PUT"),
        false,
      );
      if (!extra.CHANGE_MAPPING)
        assert.equal(readFileSync(mapFile, "utf8"), JSON.stringify(mapping));
      writeFileSync(mapFile, JSON.stringify(mapping));
    }
    ({ result, calls } = run(event, { SINGLE_UPLOAD: "1" }));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /single.asset uploads.*not supported/i);
    assert.equal(calls.length, 2);
    ({ result, calls } = run(event, { FAIL_NEON: "1" }));
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 1);
    writeFileSync(mapFile, "{}");
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    rmSync(mapFile);
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
    writeFileSync(mapFile, JSON.stringify(mapping));
    writeFileSync(join(artifact, "server/unsafe.json"), "{}");
    ({ result, calls } = run());
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
