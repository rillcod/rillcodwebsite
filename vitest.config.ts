import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Next keeps JSX for its compiler, while Vitest must transform imported
  // component TSX before Vite's import analysis runs.
  esbuild: {
    jsx: 'automatic',
  },
  oxc: false,
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['src/test/setup-env.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
