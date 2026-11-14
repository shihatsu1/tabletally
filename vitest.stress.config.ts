import { defineConfig } from 'vitest/config';

// Randomized stress suites. Scale with STRESS_N (1 = thousands of games, 0.05 = a quick check, 10 = long soak).
export default defineConfig({
  test: {
    include: ['test/stress/**/*.stress.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
  },
});
