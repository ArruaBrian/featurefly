/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.spec.tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'e2e',
    'hooks-integration',
    'composables-integration',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/index.ts',
    '!src/**/__tests__/**',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(msw)/)',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
