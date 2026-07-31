import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromPackageRoot = (relativePath: string) => (
  fileURLToPath(new URL(relativePath, import.meta.url))
);

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    sourcemap: true,
    rolldownOptions: {
      preserveEntrySignatures: "exports-only",
      input: {
        index: fromPackageRoot("./src/index.ts"),
        "site-entry": fromPackageRoot("./src/site-entry.ts"),
        "cloudflare-worker": fromPackageRoot("./src/adapters/cloudflare-worker.ts"),
        "volume-catalogue": fromPackageRoot("./src/styles/catalogue.css")
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => (
          assetInfo.names.some((name) => name === "volume-catalogue.css")
            ? "volume-catalogue.css"
            : "assets/[name]-[hash][extname]"
        ),
        chunkFileNames: "chunks/[name]-[hash].js"
      }
    }
  }
});
