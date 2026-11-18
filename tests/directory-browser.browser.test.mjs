import { test, expect } from "@playwright/test";

test("buyer filters the directory and opens a listing", async ({ page }) => {
  const base = process.env.TEST_BASE_URL;
  if (!base) throw new Error("Set TEST_BASE_URL to the isolated test app");
  await page.goto(base);
  await expect(page.locator("#category")).toBeVisible();
  await expect(page.getByText("Warung Mawar Uji").first()).toBeVisible();
  await page.locator("#category").selectOption("2");
  await page.locator("form").evaluate((form) => form.requestSubmit());
  await expect(page).toHaveURL(/category=2/);
  await expect(page.getByText("Warung Mawar Uji").first()).toBeVisible();
  await expect(page.getByText("Salon Melati Uji")).toHaveCount(0);
  await page.getByRole("link", { name: /Warung Mawar Uji/ }).click();
  await expect(page).toHaveURL(/\/listings\/10000000-0000-4000-8000-000000000001$/);
  await expect(page.locator("h1")).toHaveText("Warung Mawar Uji");
});
