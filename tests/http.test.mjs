import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL;
assert.ok(base, "Set TEST_BASE_URL to the isolated test app; see README.md");
const endpoint = `${base}/api/drafts`;
const admin1 = process.env.TEST_ADMIN_1_TOKEN;
const admin2 = process.env.TEST_ADMIN_2_TOKEN;
const outsider = process.env.TEST_OUTSIDER_TOKEN;
const headers = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
const draft = {
  id: "",
  business_name: "Kedai uji",
  description: "Kedai yang beroperasi.",
  price_includes: "Peralatan",
  price_excludes: "Properti",
  asking_price: "120000000",
  whatsapp: "628123456789",
  address: "Jalan uji",
  category_id: process.env.TEST_CATEGORY_ID ?? "",
  city_id: process.env.TEST_CITY_ID ?? "",
  revenue_amount: "30000000",
  revenue_period: "per bulan",
  revenue_meaning: "Penjualan kotor",
  profit_amount: "5000000",
  profit_period: "per bulan",
  profit_meaning: "Setelah biaya operasional",
};
async function save(token, value) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers(token),
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
    },
    body: JSON.stringify(value),
  });
}

test("signed-out visitors cannot access draft photos", async () => {
  const photos = `${base}/api/photos`;
  assert.equal((await fetch(`${photos}?listing=00000000-0000-4000-8000-000000000000`)).status, 403);
  assert.equal((await fetch(`${photos}/00000000-0000-4000-8000-000000000000`)).status, 403);
  assert.equal((await fetch(photos, { method: "POST" })).status, 403);
  assert.equal(
    (await fetch(`${photos}/00000000-0000-4000-8000-000000000000`, { method: "DELETE" })).status,
    403,
  );
});

test("signed-out visitors cannot read, write, or publish drafts", async () => {
  assert.equal((await fetch(endpoint)).status, 403);
  assert.equal((await save(undefined, draft)).status, 403);
  assert.equal(
    (
      await fetch(`${endpoint}/00000000-0000-4000-8000-000000000000/publish`, {
        method: "POST",
        headers: { Origin: new URL(base).origin },
      })
    ).status,
    403,
  );
});

test("a missing listing is not public", async () => {
  const response = await fetch(`${base}/listings/00000000-0000-4000-8000-000000000000`);
  assert.equal(response.status, 404, await response.text());
});

test(
  "both admins can save and reopen a draft; outsiders cannot read or change it",
  {
    skip: !(
      admin1 &&
      admin2 &&
      outsider &&
      process.env.TEST_CATEGORY_ID &&
      process.env.TEST_CITY_ID
    )
      ? "Requires three real Clerk session tokens and test taxonomy IDs"
      : false,
  },
  async () => {
    let response = await save(admin1, draft);
    assert.equal(response.status, 200);
    const { id } = await response.json();
    response = await fetch(endpoint, { headers: headers(admin2) });
    assert.equal(response.status, 200);
    let stored = (await response.json()).listings.find((item) => item.id === id);
    assert.equal(stored.business_name, draft.business_name);
    assert.equal(stored.asking_price, draft.asking_price);
    assert.equal(String(stored.category_id), draft.category_id);
    assert.equal(String(stored.city_id), draft.city_id);
    assert.equal(stored.revenue_meaning, draft.revenue_meaning);
    assert.equal((await fetch(endpoint, { headers: headers(outsider) })).status, 403);
    assert.equal((await save(outsider, { ...draft, id, business_name: "Tidak sah" })).status, 403);
    response = await save(admin2, { ...draft, id, business_name: "Kedai diperbarui" });
    assert.equal(response.status, 200);
    response = await fetch(endpoint, { headers: headers(admin1) });
    stored = (await response.json()).listings.find((item) => item.id === id);
    assert.equal(stored.business_name, "Kedai diperbarui");
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.doesNotMatch(await (await fetch(`${base}/`)).text(), /Kedai diperbarui/);
    const detail = `${base}/listings/${id}`;
    assert.equal((await fetch(detail)).status, 404);
    const publish = () =>
      fetch(`${endpoint}/${id}/publish`, {
        method: "POST",
        headers: { ...headers(admin1), Origin: new URL(base).origin },
      });
    assert.equal((await publish()).status, 400); // no photo
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmWQAAAAASUVORK5CYII=",
      "base64",
    );
    response = await fetch(`${base}/api/photos`, {
      method: "POST",
      headers: {
        ...headers(admin1),
        Origin: new URL(base).origin,
        "Content-Type": "image/png",
        "X-Listing-Id": id,
      },
      body: png,
    });
    assert.equal(response.status, 200);
    const photo = (await response.json()).id;
    assert.notEqual((await fetch(`${base}/api/photos/${photo}`)).status, 200);
    for (const field of [
      "business_name",
      "description",
      "price_includes",
      "price_excludes",
      "asking_price",
      "whatsapp",
      "category_id",
      "city_id",
      "revenue_period",
      "revenue_meaning",
      "profit_period",
      "profit_meaning",
    ]) {
      assert.equal((await save(admin1, { ...draft, id, [field]: "" })).status, 200);
      assert.equal((await publish()).status, 400, field);
    }
    assert.equal(
      (
        await save(admin1, {
          ...draft,
          id,
          address: "",
          revenue_amount: "",
          revenue_period: "",
          revenue_meaning: "",
          profit_amount: "",
          profit_period: "",
          profit_meaning: "",
        })
      ).status,
      200,
    );
    assert.equal((await publish()).status, 200);
    response = await fetch(detail);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Kedai uji/);
    assert.match(html, /https:\/\/wa\.me\/628123456789/);
    assert.match(html, /Harga.*pemilik/i);
    assert.doesNotMatch(html, /Jalan uji/);
    response = await fetch(`${base}/api/photos/${photo}`);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.match(html, /Peralatan/);
    assert.match(html, /Properti/);

    for (const field of ["business_name", "price_includes", "price_excludes", "whatsapp"]) {
      assert.equal((await save(admin2, { ...draft, id, [field]: " " })).status, 400, field);
    }
    assert.match(await (await fetch(detail)).text(), /Kedai uji/);
    response = await fetch(`${base}/api/photos/${photo}`, {
      method: "DELETE",
      headers: { ...headers(admin1), Origin: new URL(base).origin },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "LAST_PUBLISHED_PHOTO" });
    assert.equal((await fetch(`${base}/api/photos/${photo}`)).status, 200);
    response = await fetch(`${base}/api/photos`, {
      method: "POST",
      headers: {
        ...headers(admin2),
        Origin: new URL(base).origin,
        "Content-Type": "image/png",
        "X-Listing-Id": id,
      },
      body: png,
    });
    assert.equal(response.status, 200);
    const addedPhoto = (await response.json()).id;
    assert.equal((await fetch(`${base}/api/photos/${addedPhoto}`)).status, 200);
    assert.equal(
      (
        await fetch(`${base}/api/photos/${addedPhoto}`, {
          method: "DELETE",
          headers: { ...headers(admin2), Origin: new URL(base).origin },
        })
      ).status,
      204,
    );
    assert.notEqual((await fetch(`${base}/api/photos/${addedPhoto}`)).status, 200);
    assert.equal(
      (await save(admin1, { ...draft, id, business_name: "Suntingan pertama" })).status,
      200,
    );
    assert.equal(
      (await save(admin2, { ...draft, id, business_name: "Suntingan terakhir" })).status,
      200,
    );
    assert.match(await (await fetch(detail)).text(), /Suntingan terakhir/);
    const unpublish = (token) =>
      fetch(`${endpoint}/${id}/unpublish`, {
        method: "POST",
        headers: { ...headers(token), Origin: new URL(base).origin },
      });
    assert.equal((await unpublish(outsider)).status, 403);
    assert.equal((await unpublish(admin2)).status, 200);
    assert.equal((await fetch(detail)).status, 404);
    assert.notEqual((await fetch(`${base}/api/photos/${photo}`)).status, 200);
    assert.equal(
      (await fetch(`${base}/api/photos/${photo}`, { headers: headers(admin1) })).status,
      200,
    );

    response = await save(admin2, { ...draft, id: "" });
    assert.equal(response.status, 200);
    const financialId = (await response.json()).id;
    response = await fetch(`${base}/api/photos`, {
      method: "POST",
      headers: {
        ...headers(admin2),
        Origin: new URL(base).origin,
        "Content-Type": "image/png",
        "X-Listing-Id": financialId,
      },
      body: png,
    });
    assert.equal(response.status, 200);
    assert.equal(
      (
        await fetch(`${endpoint}/${financialId}/publish`, {
          method: "POST",
          headers: { ...headers(admin2), Origin: new URL(base).origin },
        })
      ).status,
      200,
    );
    const financialHtml = await (await fetch(`${base}/listings/${financialId}`)).text();
    assert.match(financialHtml, /Penjualan kotor/);
    assert.match(financialHtml, /Setelah biaya operasional/);
    assert.match(financialHtml, /per bulan/);
    assert.match(financialHtml, /Dilaporkan pemilik, belum diverifikasi/);
  },
);
