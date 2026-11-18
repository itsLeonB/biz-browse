import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { redactBrowserDetails, reportBrowserFailure } from "./browser-diagnostics.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("browser diagnostics omit credentials and URL query strings", () => {
  vi.stubEnv("TEST_CLERK_SECRET_KEY", "synthetic-secret-value");
  vi.stubEnv("TEST_CLERK_PUBLISHABLE_KEY", "synthetic-public-value");
  const result = redactBrowserDetails(
    "synthetic-secret-value synthetic-public-value sk_test_example pk_live_example " +
      "eyJhbGciOiJIUzI1NiJ9.payload.signature Bearer opaque-token " +
      "https://example.com/sign-in?ticket=sk_test_example&next=private-next#private-fragment",
  );
  expect(result).toBe(
    "<REDACTED> <REDACTED> <REDACTED> <REDACTED> " +
      "<REDACTED> Bearer <REDACTED> https://example.com/sign-in",
  );
});

test("failure reports redact URL parameters before writing files or stderr", async () => {
  const directory = await mkdtemp(join(tmpdir(), "browser-diagnostics-"));
  const path = join(directory, "browser-failure.json");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const page = {
    isClosed: () => false,
    url: () => "https://example.com/?ticket=private-ticket#private-fragment",
    evaluate: vi.fn().mockResolvedValue({
      title: "Failed page",
      text: "https://example.com/sign-in?key=sk_test_example&next=private-next#private-fragment",
      inputs: [],
    }),
  } as unknown as Page;
  const info = {
    status: "failed",
    expectedStatus: "passed",
    outputPath: () => path,
  } as TestInfo;
  try {
    await reportBrowserFailure({ page }, info);
    const stored = await readFile(path, "utf8");
    expect(JSON.parse(stored)).toEqual({
      url: "https://example.com/",
      title: "Failed page",
      text: "https://example.com/sign-in",
      inputs: [],
    });
    expect(error).toHaveBeenCalledExactlyOnceWith(`Browser failure details:\n${stored}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
