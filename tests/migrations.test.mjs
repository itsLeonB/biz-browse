import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const exec = promisify(execFile);
const url = process.env.TEST_MIGRATION_DATABASE_URL;

test(
  "migrations install once, roll back failures, and reject concurrent runs",
  { skip: !url, timeout: 30000 },
  async () => {
    const schema = `migration_test_${process.pid}_${Date.now()}`;
    const dir = await mkdtemp(join(tmpdir(), "migrations-"));
    const sql = postgres(url, { max: 1 });
    const args = [
      "node_modules/node-pg-migrate/bin/node-pg-migrate.js",
      "up",
      "--migrations-dir",
      dir,
      "--schema",
      schema,
      "--create-schema",
    ];
    const env = { ...process.env, DATABASE_URL: url };
    const migrate = () => exec(process.execPath, args, { env });
    try {
      await copyFile("db/1794983015408_initial.sql", join(dir, "001_initial.sql"));
      await migrate();
      await migrate();
      assert.equal(
        (await sql.unsafe(`SELECT count(*)::int AS n FROM "${schema}".pgmigrations`))[0].n,
        1,
      );
      assert.equal(
        (
          await sql.unsafe(
            `SELECT published, price_includes, price_excludes FROM "${schema}".listings LIMIT 0`,
          )
        ).count,
        0,
      );
      await writeFile(
        join(dir, "002_failure.sql"),
        "CREATE TABLE rolled_back (id int); SELECT 1 / 0;\n",
      );
      await assert.rejects(migrate());
      assert.equal(
        (await sql`SELECT to_regclass(${schema + ".rolled_back"}) AS name`)[0].name,
        null,
      );
      assert.equal(
        (await sql.unsafe(`SELECT count(*)::int AS n FROM "${schema}".pgmigrations`))[0].n,
        1,
      );
      await writeFile(
        join(dir, "002_failure.sql"),
        "-- Up Migration\nSELECT pg_sleep(2);\n-- Down Migration\nSELECT 1;\n",
      );
      const first = spawn(process.execPath, args, { env, stdio: "ignore" });
      const firstExit = new Promise((resolve) => first.on("close", resolve));
      let locked = false;
      for (let i = 0; i < 50 && !locked; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        locked = (
          await sql`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) AND classid = (7241865325823964::bigint >> 32)::oid AND objid = (7241865325823964::bigint & 4294967295)::oid AND objsubid = 1 AND granted) AS locked`
        )[0].locked;
      }
      assert.ok(locked, "first migration acquired its advisory lock");
      await assert.rejects(migrate(), /Another migration is already running/);
      assert.equal(await firstExit, 0);
      assert.equal(
        (await sql.unsafe(`SELECT count(*)::int AS n FROM "${schema}".pgmigrations`))[0].n,
        2,
      );
      await exec(process.execPath, [args[0], "down", ...args.slice(2)], { env });
      await exec(process.execPath, [args[0], "down", ...args.slice(2)], { env });
      for (const table of [
        "categories",
        "cities",
        "listings",
        "listing_photos",
        "pending_photo_deletions",
      ]) {
        assert.equal(
          (await sql`SELECT to_regclass(${schema + "." + table}) AS name`)[0].name,
          null,
        );
      }
      assert.equal(
        (await sql.unsafe(`SELECT count(*)::int AS n FROM "${schema}".pgmigrations`))[0].n,
        0,
      );
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
