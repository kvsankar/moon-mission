import { defineConfig } from 'vitest/config';

// CI environments need longer timeouts due to software WebGL rendering
const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    testTimeout: isCI ? 180000 : 60000,  // 3 min in CI, 1 min locally
    hookTimeout: isCI ? 180000 : 30000,  // 3 min in CI, 30s locally
    teardownTimeout: 10000,  // Timeout for teardown: 10 seconds
    exclude: [
      '**/.tmp/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
    pool: 'forks',  // Use forks for better isolation
    maxWorkers: 1,
    fileParallelism: false,
    // v3 singleFork still reset modules/mocks between files. Keep isolation
    // rather than trading it away to reuse a process; browser state is file-local.
    isolate: true,
    reporters: ['default'],
    logHeapUsage: true,  // Log memory usage to detect leaks
    // Global test timeout for the entire suite
    globalSetup: undefined,
    // Maximum time for the entire test suite (10 minutes)
    bail: 0,  // Don't bail on first failure
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage/unit',
      // With no include pattern, v4 retains the previous loaded-files-only policy.
      exclude: [
        'test/**',
        'scripts/**',
        'node_modules/**',
        'dist/**'
      ],
      thresholds: {
        lines: 87,
        branches: 82,
        functions: 50,
        statements: 87
      }
    }
  }
});
