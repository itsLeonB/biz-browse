import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeftIcon, MapPinIcon, MessageCircleIcon, InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

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
    <main id="main-content" tabIndex={-1} className="page-shell">
      <a className="back-link" href="/">
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Kembali ke direktori
      </a>
      <div className="page-intro">
        <Badge variant="secondary">{listing.category}</Badge>
        <h1>{listing.business_name}</h1>
        <p className="flex items-center gap-2">
          <MapPinIcon className="size-5 shrink-0" aria-hidden="true" />
          {listing.city}
        </p>
        {listing.address && <p>{listing.address}</p>}
      </div>
      <div className="detail-layout">
        <div className="detail-copy">
          <div className="photo-gallery" role="group" aria-label="Foto bisnis">
            {listing.photos.map((id, index) => (
              <img
                key={id}
                src={`/api/photos/${id}`}
                alt={`Foto ${index + 1}: ${listing.business_name}`}
                width="960"
                height="720"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            ))}
          </div>
          <section aria-labelledby="about-heading">
            <h2 id="about-heading">Tentang bisnis</h2>
            <p>{listing.description}</p>
          </section>
          <section aria-labelledby="includes-heading">
            <h2 id="includes-heading">Termasuk dalam harga</h2>
            <p>{listing.price_includes}</p>
          </section>
          <section aria-labelledby="excludes-heading">
            <h2 id="excludes-heading">Tidak termasuk dalam harga</h2>
            <p>{listing.price_excludes}</p>
          </section>
          {(listing.revenue_amount !== null || listing.profit_amount !== null) && (
            <section aria-labelledby="financial-heading">
              <h2 id="financial-heading">Angka keuangan dari pemilik</h2>
              <p className="muted-copy">Dilaporkan pemilik, belum diverifikasi.</p>
              {listing.revenue_amount !== null && (
                <div>
                  <h3>Pendapatan</h3>
                  <p className="price">{money(listing.revenue_amount)}</p>
                  <p>
                    {listing.revenue_period} — {listing.revenue_meaning}
                  </p>
                </div>
              )}
              {listing.profit_amount !== null && (
                <div>
                  <h3>Laba</h3>
                  <p className="price">{money(listing.profit_amount)}</p>
                  <p>
                    {listing.profit_period} — {listing.profit_meaning}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
        <aside className="price-panel" aria-labelledby="price-heading">
          <div>
            <h2 id="price-heading" className="text-base">
              Harga yang diminta pemilik
            </h2>
            <p className="price mt-2">{money(listing.asking_price)}</p>
          </div>
          <p className="muted-copy">
            Ini bukan penilaian platform. Tanyakan detail penawaran langsung kepada pemilik.
          </p>
          <a className={buttonVariants({ size: "lg" })} href={`https://wa.me/${listing.whatsapp}`}>
            <MessageCircleIcon data-icon="inline-start" aria-hidden="true" />
            Hubungi melalui WhatsApp
          </a>
          <Alert role="note">
            <InfoIcon aria-hidden="true" />
            <AlertTitle>Sebelum menghubungi pemilik</AlertTitle>
            <AlertDescription>
              Persetujuan listing tidak memverifikasi klaim keuangan, menyertifikasi kepemilikan,
              atau menjamin penjualan. Nama bisnis bersifat publik.
            </AlertDescription>
          </Alert>
        </aside>
      </div>
    </main>
  );
}
