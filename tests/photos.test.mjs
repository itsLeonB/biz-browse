import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL;
assert.ok(base, "Set TEST_BASE_URL to the isolated test app; see README.md");
const admin1 = process.env.TEST_ADMIN_1_TOKEN;
const admin2 = process.env.TEST_ADMIN_2_TOKEN;
const outsider = process.env.TEST_OUTSIDER_TOKEN;
const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
const origin = new URL(base).origin;
const draft = {
  id: "",
  business_name: "Foto uji",
  description: "",
  asking_price: "",
  whatsapp: "",
  address: "",
  category_id: "",
  city_id: "",
  revenue_amount: "",
  revenue_period: "",
  revenue_meaning: "",
  profit_amount: "",
  profit_period: "",
  profit_meaning: "",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmWQAAAAASUVORK5CYII=",
  "base64",
);

test(
  "admins manage private photos; outsiders cannot access them",
  {
    skip: !(admin1 && admin2 && outsider)
      ? "Requires three real Clerk session tokens and isolated test resources"
      : false,
  },
  async () => {
    let response = await fetch(`${base}/api/drafts`, {
      method: "POST",
      headers: { ...auth(admin1), Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    assert.equal(response.status, 200);
    const { id: listing } = await response.json();
    const upload = (token, body, type = "image/png", listingId = listing) =>
      fetch(`${base}/api/photos`, {
        method: "POST",
        headers: {
          ...auth(token),
          Origin: origin,
          "Content-Type": type,
          "X-Listing-Id": listingId,
        },
        body,
      });
    assert.equal((await upload(outsider, png)).status, 403);
    assert.equal((await upload(admin1, "bad")).status, 400);
    assert.equal(
      (await upload(admin1, png, "image/png", "00000000-0000-4000-8000-000000000000")).status,
      404,
    );
    response = await upload(admin1, png);
    assert.equal(response.status, 200);
    const { id } = await response.json();
    const url = `${base}/api/photos/${id}`;
    response = await fetch(`${base}/api/photos?listing=${listing}`, { headers: auth(admin2) });
    assert.deepEqual(await response.json(), [{ id }]);
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url, { headers: auth(outsider) })).status, 403);
    assert.equal(
      (await fetch(url, { method: "DELETE", headers: { ...auth(outsider), Origin: origin } }))
        .status,
      403,
    );
    response = await fetch(url, { headers: auth(admin2) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.equal(
      (await fetch(url, { method: "DELETE", headers: { ...auth(admin2), Origin: origin } })).status,
      204,
    );
    assert.equal((await fetch(url, { headers: auth(admin1) })).status, 404);
    response = await fetch(`${base}/api/photos?listing=${listing}`, { headers: auth(admin1) });
    assert.deepEqual(await response.json(), []);
  },
);
