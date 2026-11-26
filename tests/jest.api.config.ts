import type { Config } from 'jest';

// API-тесты бэкенда: tests/api/**/*.spec.ts, импортируют ../backend/src/app.factory.
// Декораторы Nest компилируются через tsconfig.api.json (extends backend/tsconfig.json).
// Nest 12 распространяется только как ESM: тесты и backend/src транспилируются в CommonJS,
// а пакеты @nestjs/* подгружаются через нативный require(esm). Для этого Jest запускается
// с NODE_OPTIONS=--experimental-vm-modules (см. tests/package.json).
const config: Config = {
  displayName: 'api',
  rootDir: '.',
  testMatch: ['<rootDir>/api/**/*.spec.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.api.json',
        // 151002: предупреждение о module: nodenext вне isolatedModules — проверка типов при этом работает.
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};

export default config;
