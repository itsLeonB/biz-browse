import postgres from "postgres";
import { z } from "zod";
import { hasRequiredContent } from "./publication.server";

const text = z.string().max(10000);
const amount = z.union([z.literal(""), z.string().regex(/^\d{1,18}$/)]).transform((v) => v || null);
const choice = z
  .union([z.literal(""), z.string().regex(/^[1-9]\d{0,17}$/)])
  .transform((v) => v || null);
export const draftSchema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  business_name: text,
  description: text,
  price_includes: text.default(""),
  price_excludes: text.default(""),
  asking_price: amount,
  whatsapp: text,
  address: text,
  category_id: choice,
  city_id: choice,
  revenue_amount: amount,
  revenue_period: text,
  revenue_meaning: text,
  profit_amount: amount,
  profit_period: text,
  profit_meaning: text,
});
type Draft = z.output<typeof draftSchema>;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return postgres(process.env.DATABASE_URL, { max: 1 });
}
export async function getDrafts() {
  const sql = db();
  try {
    const [listings, categories, cities] = await Promise.all([
      sql`SELECT * FROM listings ORDER BY updated_at DESC`,
      sql`SELECT id::text, name FROM categories ORDER BY name`,
      sql`SELECT id::text, name FROM cities ORDER BY name`,
    ]);
    return { listings, categories, cities };
  } finally {
    await sql.end();
  }
}
export async function saveDraft(d: Draft) {
  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      if (d.id) {
        const rows = await tx`SELECT published FROM listings WHERE id=${d.id} FOR UPDATE`;
        if (!rows.length) return { status: 404 as const };
        if (rows[0].published) {
          const photos = await tx`SELECT id FROM listing_photos WHERE listing_id=${d.id} LIMIT 1`;
          if (!hasRequiredContent(d) || !photos.length) return { status: 400 as const };
        }
      }
      if (d.category_id && !(await tx`SELECT id FROM categories WHERE id=${d.category_id}`).length)
        return { status: 400 as const };
      if (d.city_id && !(await tx`SELECT id FROM cities WHERE id=${d.city_id}`).length)
        return { status: 400 as const };
      if (d.id) {
        await tx`UPDATE listings SET business_name=${d.business_name}, description=${d.description}, price_includes=${d.price_includes}, price_excludes=${d.price_excludes}, asking_price=${d.asking_price}, whatsapp=${d.whatsapp}, address=${d.address}, category_id=${d.category_id}, city_id=${d.city_id}, revenue_amount=${d.revenue_amount}, revenue_period=${d.revenue_period}, revenue_meaning=${d.revenue_meaning}, profit_amount=${d.profit_amount}, profit_period=${d.profit_period}, profit_meaning=${d.profit_meaning}, updated_at=now() WHERE id=${d.id}`;
        return { status: 200 as const, id: d.id };
      }
      const rows =
        await tx`INSERT INTO listings (business_name, description, price_includes, price_excludes, asking_price, whatsapp, address, category_id, city_id, revenue_amount, revenue_period, revenue_meaning, profit_amount, profit_period, profit_meaning) VALUES (${d.business_name}, ${d.description}, ${d.price_includes}, ${d.price_excludes}, ${d.asking_price}, ${d.whatsapp}, ${d.address}, ${d.category_id}, ${d.city_id}, ${d.revenue_amount}, ${d.revenue_period}, ${d.revenue_meaning}, ${d.profit_amount}, ${d.profit_period}, ${d.profit_meaning}) RETURNING id`;
      return { status: 200 as const, id: rows[0].id as string };
    });
  } finally {
    await sql.end();
  }
}
