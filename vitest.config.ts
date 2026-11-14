import { configDefaults, defineConfig } from 'vitest/config';

// Normal unit tests. The long randomized suites in test/stress run with `npm run stress` (vitest.stress.config.ts).
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'test/stress/**'] },
});
