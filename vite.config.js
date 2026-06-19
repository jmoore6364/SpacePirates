import { defineConfig } from 'vite';

// Relative base so the build can be served from a subpath (GitHub Pages) or
// loaded from file:// inside an Electron shell later. Three.js is split into its
// own chunk to keep the app chunk small and cacheable.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
