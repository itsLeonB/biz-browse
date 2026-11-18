import { afterEach, expect, test, vi } from "vitest";
import { redactBrowserDetails } from "./browser-diagnostics.ts";

afterEach(() => vi.unstubAllEnvs());

test("browser diagnostics omit credentials and URL query strings", () => {
  vi.stubEnv("TEST_CLERK_SECRET_KEY", "synthetic-secret-value");
  vi.stubEnv("TEST_CLERK_PUBLISHABLE_KEY", "synthetic-public-value");
  const result = redactBrowserDetails(
    "synthetic-secret-value synthetic-public-value sk_test_example pk_live_example " +
      "eyJhbGciOiJIUzI1NiJ9.payload.signature Bearer opaque-token " +
      "https://example.com/sign-in?ticket=private-ticket#private-fragment",
  );
  expect(result).toBe(
    "<REDACTED> <REDACTED> <REDACTED> <REDACTED> " +
      "<REDACTED> Bearer <REDACTED> https://example.com/sign-in",
  );
});
