import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve a repo path relative to this config without pulling in Node type
// definitions (`@types/node` is not a dependency of this app, and `tsc -b`
// type-checks this file). `URL` and `import.meta.url` are standard, so this
// type-checks under the app's tsconfig.
//
// Caveat: on Windows `.pathname` yields a leading-slash path (`/C:/...`), which
// Vite normalizes in practice but is the known failure mode for this pattern.
// If `@types/node` is ever added, prefer `fileURLToPath(new URL(...))`.
const fromHere = (relativePath: string) => new URL(relativePath, import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the workspace packages to their TypeScript source rather than the
    // compiled CommonJS in `dist`. The packages are built with `tsc` (CommonJS),
    // and Vite serves symlinked workspace packages as-is, so consuming `dist`
    // meant the dev server shipped raw CJS the browser could not resolve as ESM.
    // Pointing at source lets Vite/esbuild compile it as ESM directly, which
    // fixes named-export resolution and gives HMR when the package source is
    // edited — no `tsc` rebuild required between changes.
    alias: {
      '@wings/math-engine': fromHere('../../packages/math-engine/src/index.ts'),
      '@wings/plan-domain': fromHere('../../packages/plan-domain/src/index.ts'),
    },
  },
});
