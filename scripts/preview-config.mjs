import { readFileSync } from "node:fs";

try {
  if (process.argv.length !== 4) throw new Error();
  const source = readFileSync(process.argv[2] === "-" ? 0 : process.argv[2], "utf8");
  const mapping = JSON.parse(source);
  const tokens = source.match(
    /"(?:\\.|[^"\\])*"|[{}[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g,
  );
  let index = 0;
  const value = () => {
    const token = tokens[index++];
    if (token === "{") {
      const keys = new Set();
      while (tokens[index] !== "}") {
        const key = JSON.parse(tokens[index++]);
        if (keys.has(key)) throw new Error();
        keys.add(key);
        index++;
        value();
        if (tokens[index] === ",") index++;
      }
      index++;
    } else if (token === "[") {
      while (tokens[index] !== "]") {
        value();
        if (tokens[index] === ",") index++;
      }
      index++;
    }
  };
  value();
  const fields = ["project", "branch", "database", "role", "worker", "bucket"];
  const key = mapping?.clerk_publishable_key;
  const match =
    typeof key === "string" && /^(?:pk_test_|pk_live_)([A-Za-z0-9+/]+={0,2})$/.exec(key);
  const encoded = match?.[1] ?? "";
  const decoded = Buffer.from(encoded, "base64");
  const domain = decoded.toString("utf8");
  const canonical = decoded.toString("base64");
  const validKey =
    (encoded === canonical || encoded === canonical.replace(/=+$/, "")) &&
    domain.length <= 254 &&
    domain.endsWith("$") &&
    domain
      .slice(0, -1)
      .split(".")
      .every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
  if (
    !mapping ||
    ![
      "clerk_publishable_key,live,preview,preview_id",
      "clerk_publishable_key,cloudflare_account_id,live,preview,preview_id",
    ].includes(Object.keys(mapping).sort().join()) ||
    (mapping.cloudflare_account_id !== undefined &&
      (typeof mapping.cloudflare_account_id !== "string" ||
        !/^[a-f0-9]{32}$/.test(mapping.cloudflare_account_id))) ||
    !validKey ||
    !/^[a-zA-Z0-9_-]+$/.test(mapping.preview_id) ||
    mapping.preview_id !== process.argv[3] ||
    [mapping.preview, mapping.live].some(
      (entry) =>
        !entry ||
        Object.keys(entry).sort().join() !== [...fields].sort().join() ||
        fields.some(
          (field) => typeof entry[field] !== "string" || !/^[a-zA-Z0-9_-]+$/.test(entry[field]),
        ) ||
        !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(entry.worker) ||
        !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(entry.bucket),
    ) ||
    (mapping.preview.project === mapping.live.project &&
      mapping.preview.branch === mapping.live.branch) ||
    ["role", "worker", "bucket"].some((field) => mapping.preview[field] === mapping.live[field])
  )
    throw new Error();

  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  config.name = mapping.preview.worker;
  config.r2_buckets = [{ binding: "PHOTOS", bucket_name: mapping.preview.bucket }];
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
} catch {
  process.stderr.write("Invalid or missing preview mapping; no config generated.\n");
  process.exitCode = 1;
}
