import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const value = z
  .string()
  .regex(/^\d{1,18}$/)
  .optional()
  .or(z.literal(""));
const taxonomyId = z
  .string()
  .refine((id) => /^\d{1,19}$/.test(id) && BigInt(id) <= 9223372036854775807n)
  .optional()
  .or(z.literal(""));
const filtersSchema = z.object({
  category: taxonomyId,
  city: taxonomyId,
  minPrice: value,
  maxPrice: value,
});
type Filters = z.infer<typeof filtersSchema>;

const directory = createServerFn()
  .validator((data: Filters) => data)
  .handler(async ({ data }) => {
    const parsed = filtersSchema.safeParse(data);
    if (!parsed.success) return null;
    const { getDirectory } = await import("../server/directory.server");
    return getDirectory({
      category: parsed.data.category || undefined,
      city: parsed.data.city || undefined,
      minPrice: parsed.data.minPrice || undefined,
      maxPrice: parsed.data.maxPrice || undefined,
    });
  });

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Filters => {
    const field = (value: unknown) =>
      value === undefined
        ? ""
        : typeof value === "string" || typeof value === "number"
          ? String(value)
          : "invalid";
    return {
      category: field(search.category),
      city: field(search.city),
      minPrice: field(search.minPrice),
      maxPrice: field(search.maxPrice),
    };
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => directory({ data: deps }),
  component: Directory,
});

function Directory() {
  const data = Route.useLoaderData();
  const filters = Route.useSearch();
  if (!data)
    return (
      <main>
        <h1>Direktori Bisnis</h1>
        <p>Filter tidak valid. Periksa kembali pilihan Anda.</p>
        <a href="/">Hapus filter</a>
      </main>
    );
  return (
    <main>
      <h1>Direktori Bisnis</h1>
      <search>
        <form method="get" action="/">
          <label htmlFor="category">Kategori</label>{" "}
          <select id="category" name="category" defaultValue={filters.category}>
            <option value="">Semua kategori</option>
            {data.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>{" "}
          <label htmlFor="city">Kota/kabupaten</label>{" "}
          <select id="city" name="city" defaultValue={filters.city}>
            <option value="">Semua kota/kabupaten</option>
            {data.cities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>{" "}
          <label htmlFor="minPrice">Harga minimum (Rp)</label>{" "}
          <input
            id="minPrice"
            name="minPrice"
            type="number"
            min="0"
            step="1"
            defaultValue={filters.minPrice}
          />{" "}
          <label htmlFor="maxPrice">Harga maksimum (Rp)</label>{" "}
          <input
            id="maxPrice"
            name="maxPrice"
            type="number"
            min="0"
            step="1"
            defaultValue={filters.maxPrice}
          />{" "}
          <button type="submit">Terapkan filter</button> <a href="/">Hapus filter</a>
        </form>
      </search>
      {data.listings.length === 0 ? (
        <p>Tidak ada bisnis yang sesuai dengan filter.</p>
      ) : (
        <ul>
          {data.listings.map((listing) => (
            <li key={listing.id}>
              <a href={`/listings/${listing.id}`}>
                {listing.photo && (
                  <img
                    src={`/api/photos/${listing.photo}`}
                    alt={`Foto ${listing.business_name}`}
                    width="240"
                  />
                )}
                <h2>{listing.business_name}</h2>
              </a>
              <p>
                {listing.category} · {listing.city}
              </p>
              <p>
                Harga yang diminta pemilik: Rp{" "}
                {new Intl.NumberFormat("id-ID").format(BigInt(listing.asking_price))}
              </p>
            </li>
          ))}
        </ul>
      )}
      <a href="/admin">Admin</a>
    </main>
  );
}
