import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte()],
  build: {
    // No source maps in production. The code is public anyway, and leaving
    // them out keeps the deployed bundle small.
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
