import { env } from "cloudflare:workers";
import postgres from "postgres";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return postgres(process.env.DATABASE_URL, { max: 1 });
}

export async function listPhotos(listingId: string) {
  const sql = db();
  try {
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
    const key = await sql.begin(async (tx) => {
      const rows =
        await tx`SELECT l.id, l.published FROM listings l JOIN listing_photos p ON p.listing_id = l.id WHERE p.id = ${id} FOR UPDATE OF l`;
      if (!rows.length) return null;
      if (rows[0].published) {
        const photos =
          await tx`SELECT id FROM listing_photos WHERE listing_id = ${rows[0].id} LIMIT 2`;
        if (photos.length < 2) return null;
      }
      const deleted = await tx`DELETE FROM listing_photos WHERE id = ${id} RETURNING object_key`;
      return deleted[0]?.object_key ?? null;
    });
    if (!key) return false;
    await env.PHOTOS.delete(key);
    return true;
  } finally {
    await sql.end();
  }
}
