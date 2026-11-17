import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
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
    globalThis.testPhotoBucket = {
      async put(key, bytes) {
        objects.set(key, bytes);
      },
      async get(key) {
        const body = objects.get(key);
        return body ? { body } : null;
      },
      async delete(key) {
        if (failDelete) throw new Error("storage unavailable");
        objects.delete(key);
      },
    };
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "cloudflare:workers") return { url: "test:workers", shortCircuit: true };
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url === "test:workers")
          return {
            format: "module",
            source: "export const env = { PHOTOS: globalThis.testPhotoBucket }",
            shortCircuit: true,
          };
        return nextLoad(url, context);
      },
    });
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
    } finally {
      if (listing) {
        await sql`DELETE FROM listing_photos WHERE listing_id = ${listing.id}`;
        await sql`DELETE FROM listings WHERE id = ${listing.id}`;
      }
      await sql.end();
      hooks.deregister();
      delete globalThis.testPhotoBucket;
    }
  },
);
