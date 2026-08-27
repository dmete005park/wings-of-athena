import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    commonjsOptions: {
      include: [/packages\/(math-engine|plan-domain)/, /node_modules/],
    },
  },
});
