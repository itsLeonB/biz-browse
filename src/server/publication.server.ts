import postgres from "postgres";

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return postgres(process.env.DATABASE_URL, { max: 1 });
}

export function hasRequiredContent(listing: {
  business_name: string;
  description: string;
  price_includes: string;
  price_excludes: string;
  category_id: unknown;
  city_id: unknown;
  asking_price: unknown;
  whatsapp: string;
  revenue_amount: unknown;
  revenue_period: string;
  revenue_meaning: string;
  profit_amount: unknown;
  profit_period: string;
  profit_meaning: string;
}) {
  return Boolean(
    listing.business_name.trim() &&
    listing.description.trim() &&
    listing.price_includes.trim() &&
    listing.price_excludes.trim() &&
    listing.category_id &&
    listing.city_id &&
    listing.asking_price !== null &&
    /^[1-9]\d{7,14}$/.test(listing.whatsapp) &&
    (listing.revenue_amount === null ||
      (listing.revenue_period.trim() && listing.revenue_meaning.trim())) &&
    (listing.profit_amount === null ||
      (listing.profit_period.trim() && listing.profit_meaning.trim())),
  );
}

export async function publish(id: string) {
  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      const rows = await tx`SELECT * FROM listings WHERE id = ${id} FOR UPDATE`;
      const listing = rows[0];
      if (!listing) return 404;
      const photos = await tx`SELECT id FROM listing_photos WHERE listing_id = ${id} LIMIT 1`;
      if (
        !hasRequiredContent(listing as Parameters<typeof hasRequiredContent>[0]) ||
        !photos.length
      )
        return 400;
      await tx`UPDATE listings SET published = true, updated_at = now() WHERE id = ${id}`;
      return 200;
    });
  } finally {
    await sql.end();
  }
}

export async function unpublish(id: string) {
  const sql = db();
  try {
    const rows =
      await sql`UPDATE listings SET published = false, updated_at = now() WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

type PublicListing = {
  business_name: string;
  description: string;
  price_includes: string;
  price_excludes: string;
  asking_price: string;
  whatsapp: string;
  address: string;
  category: string;
  city: string;
  revenue_amount: string | null;
  revenue_period: string;
  revenue_meaning: string;
  profit_amount: string | null;
  profit_period: string;
  profit_meaning: string;
  photos: string[];
};
export async function getPublicListing(id: string): Promise<PublicListing | null> {
  const sql = db();
  try {
    const rows =
      await sql`SELECT l.business_name, l.description, l.price_includes, l.price_excludes, l.asking_price::text, l.whatsapp, l.address,
      c.name AS category, city.name AS city, l.revenue_amount::text, l.revenue_period, l.revenue_meaning,
      l.profit_amount::text, l.profit_period, l.profit_meaning,
      ARRAY(SELECT p.id::text FROM listing_photos p WHERE p.listing_id = l.id ORDER BY p.created_at, p.id) AS photos
      FROM listings l JOIN categories c ON c.id = l.category_id JOIN cities city ON city.id = l.city_id
      WHERE l.id = ${id} AND l.published`;
    return (rows[0] as PublicListing | undefined) ?? null;
  } finally {
    await sql.end();
  }
}
