import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib', '<rootDir>/app', '<rootDir>/features', '<rootDir>/services', '<rootDir>/commercial'],
  /**
   * `.tsx` as well as `.ts`.
   *
   * Was `.test.ts` only, so a component-rendering test could not even be
   * collected — which is part of why every UI assertion in this repo reads
   * source text instead of rendering anything. M-ACTIVATION1 added the first
   * real render tests (features/shops/__tests__), and they are `.tsx` because
   * they contain JSX.
   */
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        paths: { '@/*': ['./*'] },
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        // Needed for the JSX in a render test. The app's own build is
        // unaffected — this tsconfig applies only to what ts-jest compiles.
        jsx: 'react-jsx',
      },
    }],
  },
  moduleNameMapper: {
    '^server-only$': '<rootDir>/lib/__mocks__/server-only.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/intelligence-bus/**/*.ts', '!lib/intelligence-bus/__tests__/**',
    'lib/dashboardWidgets/**/*.ts', '!lib/dashboardWidgets/__tests__/**',
  ],
};

export default config;
