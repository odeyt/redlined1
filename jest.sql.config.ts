/**
 * Executes the repository's owner-run SQL (marketing capture gates, security
 * audits) against a throwaway PostgreSQL.
 * Run with `npm run test:sql`.
 *
 * Separate from jest.config.ts (and standalone rather than importing it: Jest
 * resolves a TypeScript config's imports itself) because it needs a database to
 * execute against. It fails, never skips, without one.
 */
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.pgtest.ts'],
  testTimeout: 60_000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        paths: { '@/*': ['./*'] },
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
  moduleNameMapper: {
    '^server-only$': '<rootDir>/lib/__mocks__/server-only.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
