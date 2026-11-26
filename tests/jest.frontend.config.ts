import type { Config } from 'jest';

// Unit-тесты фронтенда: tests/frontend/**/*.spec.tsx (jsdom + React Testing Library),
// компоненты импортируются из ../frontend/src.
const config: Config = {
  displayName: 'frontend',
  rootDir: '.',
  testMatch: ['<rootDir>/frontend/**/*.spec.tsx'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.frontend.json' }],
  },
  moduleFileExtensions: ['tsx', 'ts', 'js', 'json'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/support/style-stub.cjs',
  },
  setupFiles: ['<rootDir>/support/jsdom-polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/support/jest-dom.setup.ts'],
};

export default config;
