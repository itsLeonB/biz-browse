import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: { allowedHosts: ["app"] },
  plugins: [
    cloudflare({
      configPath: process.env.PREVIEW_WRANGLER_CONFIG,
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
  ],
});
