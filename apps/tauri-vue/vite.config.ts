import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";

const dashboardAppDir = fileURLToPath(new URL("../dashboard/app", import.meta.url));
const workspaceRootDir = fileURLToPath(new URL("../../", import.meta.url));
const contractsEntry = fileURLToPath(
  new URL("../../packages/contracts/src/index.ts", import.meta.url),
);

export default defineConfig(() => ({
  clearScreen: false,
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue"],
      vueTemplate: true,
      dts: "src/auto-imports.d.ts",
    }),
    Components({
      dirs: [dashboardAppDir],
      extensions: ["vue"],
      deep: true,
      dts: "src/components.d.ts",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@dashboard": dashboardAppDir,
      "all-in-one-mcp/contracts": contractsEntry,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    fs: {
      allow: [workspaceRootDir],
    },
    hmr: process.env.TAURI_DEV_HOST
      ? {
          protocol: "ws",
          host: process.env.TAURI_DEV_HOST,
          port: 1421,
        }
      : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_DEBUG),
  },
}));
