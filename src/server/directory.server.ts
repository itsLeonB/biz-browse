import postgres from "postgres";

export async function getDirectory(filters: {
  category?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
}) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const [categories, cities, listings] = await Promise.all([
      sql<{ id: string; name: string }[]>`SELECT id::text, name FROM categories ORDER BY name`,
      sql<{ id: string; name: string }[]>`SELECT id::text, name FROM cities ORDER BY name`,
      sql<
        {
          id: string;
          business_name: string;
          asking_price: string;
          category: string;
          city: string;
          photo: string | null;
        }[]
      >`SELECT l.id::text, l.business_name, l.asking_price::text, c.name AS category, city.name AS city,
          (SELECT p.id::text FROM listing_photos p WHERE p.listing_id = l.id ORDER BY p.created_at, p.id LIMIT 1) AS photo
        FROM listings l JOIN categories c ON c.id = l.category_id JOIN cities city ON city.id = l.city_id
        WHERE l.published
          AND (${filters.category ?? null}::bigint IS NULL OR l.category_id = ${filters.category ?? null}::bigint)
          AND (${filters.city ?? null}::bigint IS NULL OR l.city_id = ${filters.city ?? null}::bigint)
          AND (${filters.minPrice ?? null}::numeric IS NULL OR l.asking_price >= ${filters.minPrice ?? null}::numeric)
          AND (${filters.maxPrice ?? null}::numeric IS NULL OR l.asking_price <= ${filters.maxPrice ?? null}::numeric)
        ORDER BY l.business_name, l.id`,
    ]);
    return { categories, cities, listings };
  } finally {
    await sql.end();
  }
}
