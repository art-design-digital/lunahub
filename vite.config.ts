import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    noExternal: ['bits-ui', 'svelte-toolbelt'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
