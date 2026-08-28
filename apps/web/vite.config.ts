import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // The workspace packages ship CommonJS from `tsc`. They are symlinked into
    // node_modules, so Vite's dev server would otherwise serve their raw CJS
    // output and the browser would fail to resolve named ESM exports. Forcing
    // pre-bundling converts them to ESM with proper named exports, mirroring the
    // build-time `commonjsOptions.include` below.
    include: ['@wings/math-engine', '@wings/plan-domain'],
  },
  build: {
    commonjsOptions: {
      include: [/packages\/(math-engine|plan-domain)/, /node_modules/],
    },
  },
});
