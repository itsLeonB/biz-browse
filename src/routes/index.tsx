import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MapPinIcon, SearchIcon, StoreIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

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
      <main id="main-content" tabIndex={-1} className="page-shell">
        <div className="page-intro">
          <h1>Direktori Bisnis</h1>
        </div>
        <Alert variant="destructive">
          <AlertTitle>Filter tidak valid</AlertTitle>
          <AlertDescription>
            Periksa kembali pilihan Anda atau <a href="/">hapus filter</a>.
          </AlertDescription>
        </Alert>
      </main>
    );
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-intro">
        <h1>Temukan bisnis untuk Anda.</h1>
        <p>
          Jelajahi bisnis yang dijual di Indonesia. Lihat detail dan harga yang diminta, lalu bicara
          langsung dengan pemilik.
        </p>
      </div>
      <div className="directory-layout">
        <search className="filter-panel" aria-label="Filter bisnis">
          <h2>Sesuaikan pencarian</h2>
          <form method="get" action="/">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="category">Kategori</FieldLabel>
                <NativeSelect id="category" name="category" defaultValue={filters.category}>
                  <NativeSelectOption value="">Semua kategori</NativeSelectOption>
                  {data.categories.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {item.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="city">Kota/kabupaten</FieldLabel>
                <NativeSelect id="city" name="city" defaultValue={filters.city}>
                  <NativeSelectOption value="">Semua kota/kabupaten</NativeSelectOption>
                  {data.cities.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {item.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="minPrice">Harga minimum (Rp)</FieldLabel>
                <Input
                  id="minPrice"
                  name="minPrice"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  defaultValue={filters.minPrice}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="maxPrice">Harga maksimum (Rp)</FieldLabel>
                <Input
                  id="maxPrice"
                  name="maxPrice"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  defaultValue={filters.maxPrice}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <Button type="submit">
                  <SearchIcon aria-hidden="true" data-icon="inline-start" />
                  Terapkan filter
                </Button>
                <a className={buttonVariants({ variant: "ghost" })} href="/">
                  Hapus filter
                </a>
              </div>
            </FieldGroup>
          </form>
        </search>
        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="results-heading">
            <h2 id="results-heading">Bisnis yang tersedia</h2>
            <p className="muted-copy">
              {new Intl.NumberFormat("id-ID").format(data.listings.length)} bisnis ditemukan
            </p>
          </div>
          {data.listings.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Tidak ada bisnis yang sesuai dengan filter.</EmptyTitle>
                <EmptyDescription>Coba kategori, kota, atau rentang harga lain.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <a className={buttonVariants({ variant: "outline" })} href="/">
                  Hapus filter
                </a>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="listing-grid">
              {data.listings.map((listing, index) => (
                <li key={listing.id} className="listing-card">
                  <a href={`/listings/${listing.id}`}>
                    <Card>
                      {listing.photo ? (
                        <img
                          className="listing-photo"
                          src={`/api/photos/${listing.photo}`}
                          alt={`Foto ${listing.business_name}`}
                          width="640"
                          height="480"
                          loading={index < 2 ? "eager" : "lazy"}
                        />
                      ) : (
                        <div className="photo-placeholder">
                          <StoreIcon aria-hidden="true" className="size-8" />
                          <span>Foto belum tersedia</span>
                        </div>
                      )}
                      <CardHeader>
                        <Badge variant="secondary">{listing.category}</Badge>
                        <CardTitle>
                          <h3 className="line-clamp-2">{listing.business_name}</h3>
                        </CardTitle>
                        <CardDescription>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
                            {listing.city}
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="muted-copy">Harga yang diminta pemilik</p>
                        <p className="price">
                          Rp {new Intl.NumberFormat("id-ID").format(BigInt(listing.asking_price))}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <span>Lihat detail bisnis</span>
                      </CardFooter>
                    </Card>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
