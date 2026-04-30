export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  buildDir: '.nuxt',
  devtools: { enabled: process.env.NODE_ENV === 'development' },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    mcpDatabasePath: process.env.ALL_IN_ONE_MCP_DB_PATH || '',
    runtimeServiceUrl: process.env.ALL_IN_ONE_MCP_RUNTIME_URL || 'http://127.0.0.1:4100'
  }
})
