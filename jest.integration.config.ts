import type { Config } from 'jest';

// Separate from jest.config.ts's default suite deliberately — this config
// is never picked up by a plain `npx jest` (that config's `roots` excludes
// `test/`), only by `npm run test:integration:security`. Every test file
// under test/integration/security/ self-guards via helpers/guard.ts and
// skips cleanly when SUPABASE_TEST_URL/SUPABASE_TEST_ANON_KEY/
// SUPABASE_TEST_SERVICE_ROLE_KEY/TEST_DATABASE_CONFIRMATION aren't set —
// this config does not need its own separate skip logic.
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration/security'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
  testTimeout: 90_000,
};

export default config;
