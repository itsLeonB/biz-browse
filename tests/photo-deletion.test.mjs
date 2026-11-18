import { test } from "vitest";
import assert from "node:assert/strict";
import postgres from "postgres";

const database = process.env.TEST_DATABASE_URL;

test(
  "photo deletion survives storage failure and protects the last published photo",
  {
    skip: !database ? "Requires an isolated TEST_DATABASE_URL" : false,
  },
  async () => {
    process.env.DATABASE_URL = database;
    const objects = new Map();
    let failDelete = false;
    let failOnce = false;
    const failedKeys = new Set();
    globalThis.testPhotoBucket = {
      async put(key, bytes) {
        objects.set(key, bytes);
      },
      async get(key) {
        const body = objects.get(key);
        return body ? { body } : null;
      },
      async delete(key) {
        if (failDelete || failedKeys.has(key) || failOnce) {
          failOnce = false;
          throw new Error("storage unavailable");
        }
        objects.delete(key);
      },
    };
    const sql = postgres(database, { max: 1 });
    let listing;
    try {
      const photos = await import("../src/server/photos.server.ts");
      [listing] = await sql`INSERT INTO listings DEFAULT VALUES RETURNING id`;
      const first = await photos.uploadPhoto(listing.id, new Uint8Array([1]), "image/png");
      const second = await photos.uploadPhoto(listing.id, new Uint8Array([2]), "image/png");
      await sql`UPDATE listings SET published = true WHERE id = ${listing.id}`;
      failDelete = true;
      await assert.rejects(photos.deletePhoto(first), /storage unavailable/);
      assert.equal(await photos.readPhoto(first, true), null);
      assert.equal(objects.size, 2);
      failDelete = false;
      assert.equal(await photos.deletePhoto(first), "deleted");
      assert.equal(objects.size, 1);
      assert.equal(await photos.deletePhoto(second), "last-published-photo");
      assert.ok(await photos.readPhoto(second, false));

      const third = await photos.uploadPhoto(listing.id, new Uint8Array([3]), "image/png");
      failDelete = true;
      await assert.rejects(photos.deletePhoto(third), /storage unavailable/);
      failDelete = false;
      assert.deepEqual(Array.from(await photos.listPhotos(listing.id)), [{ id: second }]);
      assert.equal(objects.size, 1);

      const fourth = await photos.uploadPhoto(listing.id, new Uint8Array([4]), "image/png");
      const outcomes = await Promise.all([photos.deletePhoto(second), photos.deletePhoto(fourth)]);
      assert.deepEqual(outcomes.sort(), ["deleted", "last-published-photo"]);
      assert.equal((await photos.listPhotos(listing.id)).length, 1);

      const same = await photos.uploadPhoto(listing.id, new Uint8Array([5]), "image/png");
      const lockSql = postgres(database, { max: 1 });
      let releaseLock;
      let locked;
      const acquired = new Promise((resolve) => (locked = resolve));
      const release = new Promise((resolve) => (releaseLock = resolve));
      const lock = lockSql.begin(async (tx) => {
        await tx`SELECT id FROM listings WHERE id = ${listing.id} FOR UPDATE`;
        locked();
        await release;
      });
      try {
        await acquired;
        failOnce = true;
        const deletes = Promise.allSettled([photos.deletePhoto(same), photos.deletePhoto(same)]);
        let waiting = 0;
        for (let i = 0; i < 200 && waiting < 2; i++) {
          const [row] =
            await sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT l.id, l.published FROM listings l JOIN listing_photos p%'`;
          waiting = row.count;
          if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(waiting, 2, "both deletes must wait on the listing lock");
        releaseLock();
        const results = await deletes;
        assert.equal(results.filter((result) => result.status === "rejected").length, 1);
        assert.ok(
          results.some((result) => result.status === "fulfilled" && result.value === "deleted"),
        );
        assert.equal(
          (await sql`SELECT * FROM pending_photo_deletions WHERE photo_id = ${same}`).length,
          0,
        );
      } finally {
        releaseLock();
        await lock;
        await lockSql.end();
      }

      const keys = [];
      for (let i = 0; i < 11; i++) {
        const id = await photos.uploadPhoto(listing.id, new Uint8Array([i]), "image/png");
        const [row] = await sql`SELECT object_key FROM listing_photos WHERE id = ${id}`;
        keys.push(row.object_key);
        failDelete = true;
        await assert.rejects(photos.deletePhoto(id), /storage unavailable/);
      }
      failDelete = false;
      keys.slice(0, 10).forEach((key) => failedKeys.add(key));
      await photos.listPhotos(listing.id);
      await photos.listPhotos(listing.id);
      assert.equal(objects.has(keys[10]), false, "later queue entries must not starve");
      failedKeys.clear();
      await sql`UPDATE pending_photo_deletions SET next_attempt_at = now() WHERE object_key = ANY(${keys}::uuid[])`;
      await photos.listPhotos(listing.id);
      assert.ok(keys.every((key) => !objects.has(key)));
    } finally {
      if (listing) {
        await sql`DELETE FROM pending_photo_deletions WHERE object_key = ANY(${[...objects.keys()]}::uuid[])`;
        await sql`DELETE FROM listing_photos WHERE listing_id = ${listing.id}`;
        await sql`DELETE FROM listings WHERE id = ${listing.id}`;
      }
      await sql.end();
      delete globalThis.testPhotoBucket;
    }
  },
);
