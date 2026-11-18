import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

export function redactBrowserDetails(text: string) {
  text = text.replace(/https?:\/\/[^\s"<>]+/g, (value) => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return "<REDACTED URL>";
    }
  });
  for (const value of [process.env.TEST_CLERK_SECRET_KEY, process.env.TEST_CLERK_PUBLISHABLE_KEY]) {
    if (value) text = text.split(value).join("<REDACTED>");
  }
  return text
    .replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "<REDACTED>")
    .replace(/\beyJ[A-Za-z0-9_.-]+/g, "<REDACTED>")
    .replace(/Bearer\s+[^\s"<>]+/gi, "Bearer <REDACTED>");
}

export async function reportBrowserFailure({ page }: { page: Page }, info: TestInfo) {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  try {
    const url = new URL(page.url());
    const details = await page.evaluate(() => ({
      title: document.title,
      readyState: document.readyState,
      text: document.body?.innerText.slice(0, 2000),
      inputs: Array.from(document.querySelectorAll("input"), (input) => ({
        name: input.name,
        type: input.type,
      })),
    }));
    const output = redactBrowserDetails(
      JSON.stringify({ url: `${url.origin}${url.pathname}`, ...details }, null, 2),
    );
    const path = info.outputPath("browser-failure.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, output, { mode: 0o600 });
    console.error(`Browser failure details:\n${output}`);
  } catch {
    console.error("Browser failure details unavailable.");
  }
}
