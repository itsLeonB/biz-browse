import { env } from "cloudflare:workers";
import postgres from "postgres";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return postgres(process.env.DATABASE_URL, { max: 1 });
}

export async function listPhotos(listingId: string) {
  const sql = db();
  try {
    const pending =
      await sql`SELECT photo_id, object_key FROM pending_photo_deletions WHERE next_attempt_at <= now() ORDER BY next_attempt_at, photo_id LIMIT 10`;
    for (const row of pending) {
      try {
        await env.PHOTOS.delete(row.object_key);
        await sql`DELETE FROM pending_photo_deletions WHERE photo_id = ${row.photo_id}`;
      } catch (error) {
        await sql`UPDATE pending_photo_deletions SET next_attempt_at = clock_timestamp() + interval '1 minute' WHERE photo_id = ${row.photo_id}`;
        console.error("Pending photo deletion failed", error);
      }
    }
    return await sql`SELECT id FROM listing_photos WHERE listing_id = ${listingId} ORDER BY created_at, id`;
  } finally {
    await sql.end();
  }
}

export async function uploadPhoto(listingId: string, bytes: Uint8Array, contentType: string) {
  const sql = db();
  const key = crypto.randomUUID();
  try {
    const listing = await sql`SELECT id FROM listings WHERE id = ${listingId}`;
    if (!listing.length) return null;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType } });
    try {
      const rows =
        await sql`INSERT INTO listing_photos (listing_id, object_key, content_type) VALUES (${listingId}, ${key}, ${contentType}) RETURNING id`;
      return rows[0].id;
    } catch (error) {
      await env.PHOTOS.delete(key);
      throw error;
    }
  } finally {
    await sql.end();
  }
}

export async function readPhoto(id: string, admin: boolean) {
  const sql = db();
  try {
    const rows =
      await sql`SELECT p.object_key, p.content_type FROM listing_photos p JOIN listings l ON l.id = p.listing_id WHERE p.id = ${id} AND (${admin} OR l.published)`;
    if (!rows.length) return null;
    const object = await env.PHOTOS.get(rows[0].object_key);
    if (!object) return null;
    return { body: object.body, contentType: rows[0].content_type as string };
  } finally {
    await sql.end();
  }
}

export async function deletePhoto(id: string) {
  const sql = db();
  try {
    const result = await sql.begin(async (tx) => {
      const rows =
        await tx`SELECT l.id, l.published FROM listings l JOIN listing_photos p ON p.listing_id = l.id WHERE p.id = ${id} FOR UPDATE OF l`;
      const target = rows.length ? await tx`SELECT id FROM listing_photos WHERE id = ${id}` : [];
      if (!target.length) {
        const pending =
          await tx`SELECT object_key FROM pending_photo_deletions WHERE photo_id = ${id}`;
        return pending[0]?.object_key ?? null;
      }
      if (rows[0].published) {
        const photos =
          await tx`SELECT id FROM listing_photos WHERE listing_id = ${rows[0].id} LIMIT 2`;
        if (photos.length < 2) return "last-published-photo";
      }
      const deleted = await tx`DELETE FROM listing_photos WHERE id = ${id} RETURNING object_key`;
      if (!deleted.length) return null;
      await tx`INSERT INTO pending_photo_deletions (photo_id, object_key) VALUES (${id}, ${deleted[0].object_key})`;
      return deleted[0].object_key as string;
    });
    if (result === "last-published-photo") return result;
    if (!result) return "not-found";
    await env.PHOTOS.delete(result);
    await sql`DELETE FROM pending_photo_deletions WHERE photo_id = ${id}`;
    return "deleted";
  } finally {
    await sql.end();
  }
}
