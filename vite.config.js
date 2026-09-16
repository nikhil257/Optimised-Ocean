import { defineConfig } from 'vite';

// Two modes:
//  - `npm run dev`   → serves index.html harness for local development
//  - `npm run build` → bundles a single IIFE (window.OceanIntro) for CDN hosting.
//    Webflow integration = one container div + one <script> tag.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'OceanIntro',
      formats: ['iife'],
      fileName: () => 'ocean-intro.js',
    },
    target: 'es2019',
    sourcemap: true,
    minify: 'esbuild',
  },
});
