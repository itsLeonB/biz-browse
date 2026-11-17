import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { UserButton } from "@clerk/tanstack-react-start";
import { useEffect, useState, type FormEvent } from "react";

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
  async function load() {
    const response = await fetch(`/api/photos?listing=${encodeURIComponent(listingId)}`);
    if (!response.ok) throw new Error();
    setPhotos(await response.json());
  }
  useEffect(() => {
    load().catch(() => setMessage("Foto tidak dapat dimuat."));
  }, [listingId]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("photo");
    if (!(file instanceof File) || !file.size) return;
    setMessage("Mengunggah foto…");
    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": file.type, "X-Listing-Id": listingId },
        body: file,
      });
      if (!response.ok) throw new Error();
      form.reset();
      await load();
      setMessage("Foto tersimpan.");
    } catch {
      setMessage("Foto tidak dapat diunggah. Gunakan JPEG, PNG, atau WebP hingga 5 MB.");
    }
  }
  async function remove(id: string) {
    try {
      const response = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setPhotos((current) => current.filter((photo) => photo.id !== id));
      setMessage("Foto dihapus.");
    } catch {
      setMessage("Foto tidak dapat dihapus.");
    }
  }
  return (
    <section aria-labelledby="photos-heading">
      <h2 id="photos-heading">Foto yang disetujui pemilik</h2>
      <ul>
        {photos.map((photo) => (
          <li key={photo.id}>
            <img src={`/api/photos/${photo.id}`} alt="Foto bisnis" width="200" />
            <button type="button" onClick={() => remove(photo.id)}>
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
        <button type="submit">Unggah foto</button>
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
  async function load() {
    const response = await fetch("/api/drafts");
    if (!response.ok) throw new Error("Tidak dapat memuat draf.");
    setData(await response.json());
  }
  useEffect(() => {
    load().catch(() => setStatus("Tidak dapat memuat draf."));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Menyimpan…");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      if (!response.ok) throw new Error();
      const saved = (await response.json()) as { id: string };
      setDraft({
        ...(Object.fromEntries(form) as Record<string, string>),
        id: saved.id,
        published: draft.published,
      });
      setStatus("Listing tersimpan.");
      await load().catch(() => setStatus("Listing tersimpan, tetapi daftar tidak dapat dimuat."));
    } catch {
      setStatus("Draf tidak tersimpan. Periksa data dan coba lagi.");
    }
  }
  async function publish() {
    try {
      const response = await fetch(`/api/drafts/${draft.id}/publish`, { method: "POST" });
      if (!response.ok) throw new Error();
      setDraft((current) => ({ ...current, published: true }));
      setStatus("Listing diterbitkan.");
      await load();
    } catch {
      setStatus(
        "Tidak dapat menerbitkan. Lengkapi nama, kategori, kota, deskripsi, isi dan pengecualian harga, harga, nomor WhatsApp, dan foto. Isi periode dan arti untuk setiap angka keuangan.",
      );
    }
  }
  async function unpublish() {
    try {
      const response = await fetch(`/api/drafts/${draft.id}/unpublish`, { method: "POST" });
      if (!response.ok) throw new Error();
      setDraft((current) => ({ ...current, published: false }));
      setStatus("Listing tidak lagi publik.");
      await load();
    } catch {
      setStatus("Listing tidak dapat ditarik.");
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
        onClick={() => {
          setDraft({ id: "" });
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
              onClick={() => {
                setDraft(item);
                setFormVersion((n) => n + 1);
              }}
            >
              {item.business_name || "Draf tanpa nama"} {item.published ? "(publik)" : "(pribadi)"}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={save} key={`${draft.id || "new"}-${formVersion}`}>
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
        <button type="submit">Simpan draf</button>
      </form>
      {typeof draft.id === "string" && draft.id && <Photos key={draft.id} listingId={draft.id} />}
      {draft.id &&
        (draft.published ? (
          <button type="button" onClick={unpublish}>
            Tarik listing dari publik
          </button>
        ) : (
          <button type="button" onClick={publish}>
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
