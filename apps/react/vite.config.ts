import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import inspect from 'vite-plugin-inspect'

// https://vite.dev/config/
export default defineConfig({
  devtools: true,
  plugins: [react(), tailwind(), inspect()],
})
