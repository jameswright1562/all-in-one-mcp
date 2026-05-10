export default defineNuxtConfig({
  compatibilityDate: "2026-04-10",
  buildDir: ".nuxt",
  devtools: { enabled: process.env.NODE_ENV === "development" },
  css: ["@all-in-one-mcp/dashboard-shared/styles.css"],
  runtimeConfig: {
    mcpDatabasePath: process.env.ALL_IN_ONE_MCP_DB_PATH || "",
    mcpGatewayPort: Number(process.env.ALL_IN_ONE_MCP_PORT || 3000),
    runtimeServiceUrl:
      process.env.ALL_IN_ONE_MCP_RUNTIME_URL || "http://127.0.0.1:4100",
  },
  modules: ["@nuxtjs/tailwindcss"],
});
