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
    const migrate = () => exec(process.execPath, args, { env, timeout: 10000 });
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
        `-- Up Migration\nSELECT pg_advisory_xact_lock(1714, ${process.pid});\n-- Down Migration\nSELECT 1;\n`,
      );
      await sql`SELECT pg_advisory_lock(1714, ${process.pid})`;
      let firstExit;
      try {
        const first = spawn(process.execPath, args, { env, stdio: "ignore", timeout: 15000 });
        firstExit = new Promise((resolve) => first.on("close", resolve));
        let waiting = false;
        for (let i = 0; i < 200 && !waiting; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          waiting = (
            await sql`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) AND classid = 1714 AND objid = ${process.pid} AND objsubid = 2 AND NOT granted) AS waiting`
          )[0].waiting;
        }
        assert.ok(waiting, "first migration reached the barrier");
        await assert.rejects(migrate(), /Another migration is already running/);
      } finally {
        await sql`SELECT pg_advisory_unlock(1714, ${process.pid})`;
        if (firstExit) await firstExit;
      }
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
