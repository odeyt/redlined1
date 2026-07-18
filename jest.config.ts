import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib', '<rootDir>/app', '<rootDir>/features'],
  testMatch: ['**/__tests__/**/*.test.ts'],
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
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/intelligence-bus/**/*.ts', '!lib/intelligence-bus/__tests__/**',
    'lib/dashboardWidgets/**/*.ts', '!lib/dashboardWidgets/__tests__/**',
  ],
};

export default config;
