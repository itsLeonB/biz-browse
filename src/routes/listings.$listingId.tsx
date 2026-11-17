import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const getListing = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    if (!z.uuid().safeParse(data).success) return null;
    const { getPublicListing } = await import("../server/publication.server");
    return getPublicListing(data);
  });
export const Route = createFileRoute("/listings/$listingId")({
  loader: async ({ params }) => {
    const listing = await getListing({ data: params.listingId });
    if (!listing) throw notFound();
    return listing;
  },
  component: Listing,
});
function Listing() {
  const listing = Route.useLoaderData();
  const money = (value: string) => `Rp ${new Intl.NumberFormat("id-ID").format(BigInt(value))}`;
  return (
    <main>
      <h1>{listing.business_name}</h1>
      <p>
        {listing.category} · {listing.city}
      </p>
      {listing.address && <p>{listing.address}</p>}
      <p>{listing.description}</p>
      <p>Termasuk dalam harga: {listing.price_includes}</p>
      <p>Tidak termasuk dalam harga: {listing.price_excludes}</p>
      <p>
        Harga yang diminta pemilik: {money(listing.asking_price)}. Ini bukan penilaian platform.
      </p>
      {listing.photos.map((id) => (
        <img key={id} src={`/api/photos/${id}`} alt={`Foto ${listing.business_name}`} width="400" />
      ))}
      {listing.revenue_amount !== null && (
        <p>
          Pendapatan: {money(listing.revenue_amount)} {listing.revenue_period} —{" "}
          {listing.revenue_meaning}. Dilaporkan pemilik, belum diverifikasi.
        </p>
      )}
      {listing.profit_amount !== null && (
        <p>
          Laba: {money(listing.profit_amount)} {listing.profit_period} — {listing.profit_meaning}.
          Dilaporkan pemilik, belum diverifikasi.
        </p>
      )}
      <p>
        Persetujuan listing tidak memverifikasi klaim keuangan, menyertifikasi kepemilikan, atau
        menjamin penjualan. Nama bisnis bersifat publik.
      </p>
      <a href={`https://wa.me/${listing.whatsapp}`}>Hubungi melalui WhatsApp</a>
    </main>
  );
}
