export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  buildDir: '.nuxt',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    mcpDatabasePath: process.env.ALL_IN_ONE_MCP_DB_PATH || '',
    mcpGatewayPort: Number(process.env.ALL_IN_ONE_MCP_PORT || 3000),
    runtimeServiceUrl: process.env.ALL_IN_ONE_MCP_RUNTIME_URL || 'http://127.0.0.1:4100'
  }
})
