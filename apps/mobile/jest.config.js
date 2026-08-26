module.exports = {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/app/**',
    '!src/graphql/generated/**',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test/**',
    '!src/**/testing/**',
  ],
  coverageThreshold: {
    global: { statements: 86, branches: 77, functions: 81, lines: 89 },
  },
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
};
