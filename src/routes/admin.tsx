import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { UserButton } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";

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
      <ul>
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <img src={`/api/photos/${photo.id}`} alt="Foto bisnis" width="200" />
            <button
              type="button"
              aria-label={`Hapus foto ${index + 1}`}
              onClick={() => remove(photo.id)}
            >
              Hapus foto
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={upload} aria-labelledby="photos-heading">
        <label htmlFor="photo">Pilih foto JPEG, PNG, atau WebP (maks. 5 MB)</label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
        <button type="submit" disabled={uploading}>
          Unggah foto
        </button>
      </form>
      <p role="status">{message}</p>
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
    <main>
      <header>
        <h1>Listing bisnis</h1>
        <UserButton />
      </header>
      <p>
        Draf bersifat pribadi. Nama bisnis yang diterbitkan bersifat publik. Simpan perubahan
        sebelum menerbitkan.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setDraft({ id: "" });
          setDirty(false);
          setFormVersion((n) => n + 1);
        }}
      >
        Draf baru
      </button>
      <ul>
        {data?.listings.map((item) => (
          <li key={String(item.id)}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(item);
                setDirty(false);
                setFormVersion((n) => n + 1);
              }}
            >
              {item.business_name || "Draf tanpa nama"} {item.published ? "(publik)" : "(pribadi)"}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={save}
        onInput={() => {
          editVersion.current++;
          setDirty(true);
        }}
        key={formVersion}
      >
        <input type="hidden" name="id" value={String(draft.id || "")} />
        {fields.map(([name, label]) => (
          <p key={name}>
            <label htmlFor={name}>{label}</label>
            <br />
            {name === "description" || name.startsWith("price_") || name.endsWith("_meaning") ? (
              <textarea
                id={name}
                name={name}
                defaultValue={String(draft[name] || "")}
                maxLength={10000}
              />
            ) : (
              <input
                id={name}
                name={name}
                defaultValue={String(draft[name] || "")}
                inputMode={
                  name.endsWith("_amount") || name === "asking_price" ? "numeric" : undefined
                }
                maxLength={10000}
              />
            )}
          </p>
        ))}
        {(["category", "city"] as const).map((type) => (
          <p key={type}>
            <label htmlFor={type}>{type === "category" ? "Kategori" : "Kota/kabupaten"}</label>
            <br />
            <select id={type} name={type + "_id"} defaultValue={String(draft[type + "_id"] || "")}>
              <option value="">Pilih</option>
              {data?.[type === "category" ? "categories" : "cities"].map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </p>
        ))}
        <button type="submit" disabled={busy || !data}>
          Simpan draf
        </button>
      </form>
      {typeof draft.id === "string" && draft.id && <Photos key={draft.id} listingId={draft.id} />}
      {draft.id &&
        (draft.published ? (
          <button type="button" disabled={busy} onClick={unpublish}>
            Tarik listing dari publik
          </button>
        ) : (
          <button type="button" disabled={busy || refreshFailed || dirty} onClick={publish}>
            Terbitkan listing tersimpan
          </button>
        ))}
      {draft.id && (
        <p>
          Alamat publik setelah diterbitkan: <a href={`/listings/${draft.id}`}>lihat listing</a>
        </p>
      )}
      <p role="status">{status}</p>
    </main>
  );
}
