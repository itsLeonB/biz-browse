import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { UserButton } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlusIcon, SaveIcon, UploadIcon, Trash2Icon, InfoIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const requireAdmin = createServerFn().handler(async () => {
  const { isAdmin } = await import("../server/auth.server");
  if (!(await isAdmin())) throw redirect({ to: "/sign-in/$" });
});
export const Route = createFileRoute("/admin")({
  beforeLoad: () => requireAdmin(),
  component: Admin,
});

type Draft = Record<string, string | boolean | null>;
type Data = {
  listings: Draft[];
  categories: { id: string; name: string }[];
  cities: { id: string; name: string }[];
};
const fields = [
  ["business_name", "Nama bisnis"],
  ["description", "Deskripsi"],
  ["price_includes", "Yang termasuk dalam harga"],
  ["price_excludes", "Yang tidak termasuk dalam harga"],
  ["asking_price", "Harga yang diminta (IDR)"],
  ["whatsapp", "Nomor WhatsApp yang disetujui (kode negara dan angka saja, contoh 628123456789)"],
  ["address", "Alamat jalan (opsional)"],
  ["revenue_amount", "Pendapatan (IDR, opsional)"],
  ["revenue_period", "Periode pendapatan"],
  ["revenue_meaning", "Arti pendapatan"],
  ["profit_amount", "Laba (IDR, opsional)"],
  ["profit_period", "Periode laba"],
  ["profit_meaning", "Arti laba"],
];
function Photos({ listingId }: { listingId: string }) {
  const [photos, setPhotos] = useState<{ id: string }[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadInProgress = useRef(false);
  const loadVersion = useRef(0);
  async function load() {
    const version = ++loadVersion.current;
    const response = await fetch(`/api/photos?listing=${encodeURIComponent(listingId)}`);
    if (!response.ok) throw new Error();
    const next = (await response.json()) as { id: string }[];
    if (version === loadVersion.current) setPhotos(next);
  }
  useEffect(() => {
    load().catch(() => setMessage("Foto tidak dapat dimuat."));
  }, [listingId]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadInProgress.current) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("photo");
    if (!(file instanceof File) || !file.size) return;
    uploadInProgress.current = true;
    setUploading(true);
    setMessage("Mengunggah foto…");
    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": file.type, "X-Listing-Id": listingId },
        body: file,
      });
      if (!response.ok) throw new Error();
      form.reset();
      try {
        await load();
        setMessage("Foto tersimpan.");
      } catch {
        setMessage("Foto tersimpan, tetapi daftar foto tidak dapat dimuat ulang.");
      }
    } catch {
      setMessage("Foto tidak dapat diunggah. Gunakan JPEG, PNG, atau WebP hingga 5 MB.");
    } finally {
      uploadInProgress.current = false;
      setUploading(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("Hapus foto ini? Foto yang dihapus tidak dapat dikembalikan.")) return;
    try {
      const response = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (response.status === 409) {
        const error = (await response.json().catch(() => null)) as { code?: string } | null;
        if (error?.code === "LAST_PUBLISHED_PHOTO") {
          setMessage(
            "Foto terakhir listing publik tidak dapat dihapus. Tarik listing atau tambahkan foto lain terlebih dahulu.",
          );
          return;
        }
      }
      if (!response.ok && response.status !== 404) throw new Error();
      ++loadVersion.current;
      setPhotos((current) => current.filter((photo) => photo.id !== id));
      setMessage("Foto dihapus.");
      load().catch(() => setMessage("Foto dihapus, tetapi daftar foto tidak dapat dimuat ulang."));
    } catch {
      setMessage("Foto tidak dapat dihapus.");
    }
  }
  return (
    <section aria-labelledby="photos-heading">
      <h2 id="photos-heading">Foto yang disetujui pemilik</h2>
      <ul className="admin-photos">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <img
              src={`/api/photos/${photo.id}`}
              alt={`Foto bisnis ${index + 1}`}
              width="400"
              height="300"
              loading="lazy"
            />
            <Button
              variant="outline"
              type="button"
              aria-label={`Hapus foto ${index + 1}`}
              onClick={() => remove(photo.id)}
            >
              <Trash2Icon aria-hidden="true" data-icon="inline-start" />
              Hapus foto
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={upload} aria-labelledby="photos-heading">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="photo">Pilih foto JPEG, PNG, atau WebP (maks. 5 MB)</FieldLabel>
            <Input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
            <FieldDescription>
              Gunakan foto yang pemilik izinkan untuk ditampilkan kepada publik.
            </FieldDescription>
          </Field>
          <Button className="self-start" type="submit" disabled={uploading}>
            {uploading ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <UploadIcon aria-hidden="true" data-icon="inline-start" />
            )}
            Unggah foto
          </Button>
        </FieldGroup>
      </form>
      <p className="status-line mt-3" role="status">
        {message}
      </p>
    </section>
  );
}

function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft>({ id: "" });
  const [status, setStatus] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editVersion = useRef(0);
  async function load() {
    const response = await fetch("/api/drafts");
    if (!response.ok) throw new Error("Tidak dapat memuat draf.");
    const next = (await response.json()) as Data;
    setData(next);
    setRefreshFailed(false);
    setDraft((current) => {
      const listing = next.listings.find((item) => item.id === current.id);
      return listing ? { ...current, published: listing.published } : current;
    });
  }
  async function refresh(success: string | (() => string)) {
    const message = () => (typeof success === "function" ? success() : success);
    try {
      await load();
      setStatus(message());
    } catch {
      setData((current) => current && { ...current, listings: [] });
      setRefreshFailed(true);
      setStatus(
        `${message()} Daftar tidak dapat dimuat ulang. Muat ulang halaman untuk melihat daftar.`,
      );
    }
  }
  useEffect(() => {
    load().catch(() =>
      setStatus("Tidak dapat memuat draf. Muat ulang halaman untuk mencoba lagi."),
    );
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !data) return;
    setBusy(true);
    setStatus("Menyimpan…");
    const form = new FormData(event.currentTarget);
    const version = editVersion.current;
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      if (!response.ok) throw new Error();
      const saved = (await response.json()) as { id: string };
      setDraft((current) => ({ ...current, id: saved.id }));
      await refresh(() => {
        const changed = editVersion.current !== version;
        setDirty(changed);
        return changed
          ? "Listing tersimpan. Perubahan terbaru belum tersimpan."
          : "Listing tersimpan.";
      });
    } catch {
      setStatus("Draf tidak tersimpan. Periksa data dan coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/drafts/${draft.id}/publish`, { method: "POST" });
      if (!response.ok) throw new Error();
      setDraft((current) => ({ ...current, published: true }));
      await refresh("Listing diterbitkan.");
    } catch {
      setStatus(
        "Tidak dapat menerbitkan. Lengkapi nama, kategori, kota, deskripsi, isi dan pengecualian harga, harga, nomor WhatsApp, dan foto. Isi periode dan arti untuk setiap angka keuangan.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function unpublish() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/drafts/${draft.id}/unpublish`, { method: "POST" });
      if (!response.ok) throw new Error();
      setDraft((current) => ({ ...current, published: false }));
      await refresh("Listing tidak lagi publik.");
    } catch {
      setStatus("Listing tidak dapat ditarik.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <header className="admin-heading">
        <div className="flex flex-col gap-2">
          <h1>Listing bisnis</h1>
          <p className="muted-copy">Kelola draf dan listing publik.</p>
        </div>
        <UserButton />
      </header>
      <Alert role="note">
        <InfoIcon aria-hidden="true" />
        <AlertTitle>Periksa sebelum menerbitkan</AlertTitle>
        <AlertDescription>
          Draf bersifat pribadi. Nama bisnis yang diterbitkan bersifat publik. Simpan perubahan
          sebelum menerbitkan.
        </AlertDescription>
      </Alert>
      <p className="status-line mt-3" role="status">
        {status}
      </p>
      <div className="admin-layout">
        <aside aria-labelledby="drafts-heading">
          <div className="flex flex-col gap-4">
            <h2 id="drafts-heading">Daftar listing</h2>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => {
                if (dirty && !window.confirm("Buang perubahan yang belum tersimpan?")) return;
                setDraft({ id: "" });
                setDirty(false);
                setFormVersion((n) => n + 1);
              }}
            >
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              Draf baru
            </Button>
          </div>
          {!data ? (
            <div className="flex flex-col gap-3 mt-4" role="status">
              <span className="sr-only">Memuat daftar listing…</span>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : data.listings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {refreshFailed ? "Daftar tidak dapat dimuat" : "Belum ada listing"}
                </EmptyTitle>
                <EmptyDescription>
                  {refreshFailed
                    ? "Muat ulang halaman untuk mencoba lagi."
                    : "Pilih Draf baru untuk menambahkan bisnis."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="draft-list">
              {data.listings.map((item) => (
                <li key={String(item.id)}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={draft.id === item.id}
                    onClick={() => {
                      if (dirty && !window.confirm("Buang perubahan yang belum tersimpan?")) return;
                      setDraft(item);
                      setDirty(false);
                      setFormVersion((n) => n + 1);
                    }}
                  >
                    <span className="line-clamp-2">
                      {item.business_name || "Draf tanpa nama"}{" "}
                      <span className="sr-only">{item.published ? "(publik)" : "(pribadi)"}</span>
                    </span>
                    <Badge aria-hidden="true" variant={item.published ? "default" : "outline"}>
                      {item.published ? "Publik" : "Pribadi"}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="editor">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>{draft.id ? "Edit listing" : "Draf baru"}</h2>
            <Badge variant="outline">
              {dirty ? "Perubahan belum tersimpan" : draft.published ? "Publik" : "Draf pribadi"}
            </Badge>
          </div>
          <form
            onSubmit={save}
            onInput={() => {
              editVersion.current++;
              setDirty(true);
            }}
            key={formVersion}
            autoComplete="off"
          >
            <input type="hidden" name="id" value={String(draft.id || "")} />
            <FieldGroup>
              {[
                { title: "Informasi bisnis", items: fields.slice(0, 2) },
                { title: "Harga dan kontak", items: fields.slice(2, 7) },
                { title: "Angka keuangan (opsional)", items: fields.slice(7) },
              ].map((section) => (
                <FieldSet className="editor-section" key={section.title}>
                  <FieldLegend>{section.title}</FieldLegend>
                  {section.title === "Angka keuangan (opsional)" && (
                    <FieldDescription>
                      Jika Anda mengisi pendapatan atau laba, isi juga periode dan artinya. Angka
                      ini dilaporkan pemilik, belum diverifikasi.
                    </FieldDescription>
                  )}
                  <FieldGroup className="editor-fields">
                    {section.items.map(([name, label]) => (
                      <Field
                        key={name}
                        className={cn(
                          (name === "description" || name === "whatsapp") && "md:col-span-2",
                        )}
                      >
                        <FieldLabel htmlFor={name}>{label}</FieldLabel>
                        {name === "description" ||
                        name.startsWith("price_") ||
                        name.endsWith("_meaning") ? (
                          <Textarea
                            id={name}
                            name={name}
                            defaultValue={String(draft[name] || "")}
                            maxLength={10000}
                          />
                        ) : (
                          <Input
                            id={name}
                            name={name}
                            type={name === "whatsapp" ? "tel" : "text"}
                            defaultValue={String(draft[name] || "")}
                            inputMode={
                              name.endsWith("_amount") || name === "asking_price"
                                ? "numeric"
                                : undefined
                            }
                            maxLength={10000}
                          />
                        )}
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
              ))}
              <FieldSet className="editor-section">
                <FieldLegend>Kategori dan lokasi</FieldLegend>
                <FieldGroup className="editor-fields">
                  {(["category", "city"] as const).map((type) => (
                    <Field key={type}>
                      <FieldLabel htmlFor={type}>
                        {type === "category" ? "Kategori" : "Kota/kabupaten"}
                      </FieldLabel>
                      <NativeSelect
                        id={type}
                        name={type + "_id"}
                        defaultValue={String(draft[type + "_id"] || "")}
                      >
                        <NativeSelectOption value="">Pilih</NativeSelectOption>
                        {data?.[type === "category" ? "categories" : "cities"].map((option) => (
                          <NativeSelectOption key={option.id} value={option.id}>
                            {option.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
              <div className="editor-actions">
                <Button type="submit" disabled={busy || !data}>
                  {busy ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <SaveIcon aria-hidden="true" data-icon="inline-start" />
                  )}
                  Simpan draf
                </Button>
                {dirty && <p className="muted-copy">Simpan sebelum menerbitkan.</p>}
              </div>
            </FieldGroup>
          </form>
          {typeof draft.id === "string" && draft.id && (
            <Photos key={draft.id} listingId={draft.id} />
          )}
          {draft.id && (
            <section className="flex flex-col gap-4" aria-labelledby="publication-heading">
              <h2 id="publication-heading">Publikasi</h2>
              <div className="editor-actions">
                {draft.published ? (
                  <Button variant="outline" type="button" disabled={busy} onClick={unpublish}>
                    Tarik listing dari publik
                  </Button>
                ) : (
                  <Button type="button" disabled={busy || refreshFailed || dirty} onClick={publish}>
                    Terbitkan listing tersimpan
                  </Button>
                )}
                {draft.published && (
                  <a
                    className={buttonVariants({ variant: "ghost" })}
                    href={`/listings/${draft.id}`}
                  >
                    Lihat listing publik
                  </a>
                )}
              </div>
              <p className="muted-copy">
                Persetujuan listing tidak memverifikasi klaim keuangan atau kepemilikan.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
