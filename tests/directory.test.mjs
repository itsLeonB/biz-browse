import { test } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const base = process.env.TEST_BASE_URL;
assert.ok(base, "Set TEST_BASE_URL to the isolated test app; see README.md");

test("directory shows only public listing cards and filters them on the server", async () => {
  const cases = [
    ["", ["Warung Mawar Uji", "Salon Melati Uji"]],
    ["?category=2", ["Warung Mawar Uji"]],
    ["?city=3", ["Salon Melati Uji"]],
    ["?minPrice=150000000", ["Salon Melati Uji"]],
    ["?maxPrice=100000000", ["Warung Mawar Uji"]],
    ["?maxPrice=999999999999999999", ["Warung Mawar Uji", "Salon Melati Uji"]],
    ["?category=2&city=2&minPrice=100000000&maxPrice=100000000", ["Warung Mawar Uji"]],
    ["?category=2&city=3", []],
    ["?category=9223372036854775807", []],
  ];
  for (const [query, expected] of cases) {
    const response = await fetch(`${base}/${query}`);
    assert.equal(response.status, 200, query);
    const html = await response.text();
    for (const name of ["Warung Mawar Uji", "Salon Melati Uji"]) {
      assert.equal(html.includes(name), expected.includes(name), `${query}: ${name}`);
    }
    assert.doesNotMatch(
      html,
      /Warung Draf Rahasia|Warung Ditarik Rahasia|Alamat rahasia|Deskripsi rahasia|62812345670|30000000-0000/,
    );
    if (!expected.length) assert.match(html, /tidak ada bisnis/i);
  }
  const html = await (await fetch(base)).text();
  assert.match(html, /Kuliner Uji/);
  assert.match(html, /Bandung Uji/);
  assert.match(html, /100\.000\.000/);
  assert.match(html, /\/api\/photos\/20000000-0000-4000-8000-000000000001/);
  assert.match(html, /\/listings\/10000000-0000-4000-8000-000000000001/);
});

test(
  "directory reads current published data without rebuilding",
  {
    skip:
      !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to the isolated fixture database",
  },
  async () => {
    const sql = postgres(process.env.TEST_DATABASE_URL, { max: 1 });
    const id = randomUUID();
    const before = `Warung Lama ${id}`;
    const after = `Warung Baru ${id}`;
    try {
      await sql`INSERT INTO listings (id, business_name, category_id, city_id, asking_price, published) VALUES (${id}, ${before}, 2, 2, 100000000, true)`;
      assert.ok((await (await fetch(base)).text()).includes(before));
      await sql`UPDATE listings SET business_name = ${after} WHERE id = ${id}`;
      const html = await (await fetch(base)).text();
      assert.ok(html.includes(after));
      assert.ok(!html.includes(before));
    } finally {
      try {
        await sql`DELETE FROM listings WHERE id = ${id}`;
      } finally {
        await sql.end();
      }
    }
  },
);

test("invalid filters do not return unfiltered listings", async () => {
  for (const query of [
    "?category=abc",
    "?city=-1",
    "?minPrice=-1",
    "?maxPrice=1000000000000000000",
  ]) {
    const html = await (await fetch(`${base}/${query}`)).text();
    assert.match(html, /Filter tidak valid/i, query);
    assert.doesNotMatch(html, /Warung Mawar Uji|Salon Melati Uji/, query);
  }
});
