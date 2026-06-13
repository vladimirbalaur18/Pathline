import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.{test,spec}.ts', 'examples/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts', '**/*.types.ts'],
      thresholds: {
        lines: 90,
        functions: 85,
        statements: 90,
        branches: 85,
      },
    },
  },
});
