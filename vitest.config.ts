import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    {
      name: "test-cloudflare-workers",
      resolveId: (id) => (id === "cloudflare:workers" ? "\0test-cloudflare-workers" : undefined),
      load: (id) =>
        id === "\0test-cloudflare-workers"
          ? "export const env = { PHOTOS: globalThis.testPhotoBucket }"
          : undefined,
    },
  ],
  test: {
    include: [
      "tests/{admin-browser-support,auth,separator,directory,http,migrations,photo-deletion,photos}.test.mjs",
    ],
    fileParallelism: false,
  },
});
