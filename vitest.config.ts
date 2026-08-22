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
    // Several architecture guards intentionally scan the full source tree.
    // Give those deterministic checks enough headroom when every test file is
    // competing for I/O in CI; assertions still fail immediately on drift.
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
