import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue"],
      vueTemplate: true,
      dts: resolve(rootDir, "src/auto-imports.d.ts"),
    }),
  ],
  build: {
    lib: {
      entry: resolve(rootDir, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "styles",
    },
    rollupOptions: {
      external: ["vue", "@all-in-one-mcp/contracts"],
    },
  },
});
