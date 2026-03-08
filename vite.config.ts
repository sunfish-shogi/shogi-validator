import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'docs',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
