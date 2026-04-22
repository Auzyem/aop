import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: [],
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.test.json',
      useESM: false,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@aop/db$': '<rootDir>/../../packages/db/src/index.ts',
    '^@aop/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@aop/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  },
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  coverageReporters: ['json', 'json-summary', 'text', 'lcov'],
  collectCoverageFrom: [
    'src/auth/**/*.ts',
    'src/lib/**/*.ts',
    'src/middleware/**/*.ts',
    'src/modules/settlement/**/*.ts',
    'src/modules/lme/**/*.ts',
    // Exclude files requiring external services (covered at integration level)
    '!src/lib/redis.ts',
    '!src/lib/integrations/**/live.ts',
    '!src/lib/integrations/**/dilisense.ts',
    '!src/lib/integrations/**/ses.live.ts',
    '!src/lib/integrations/**/scheduler.ts',
    '!src/lib/integrations/**/sms.service.ts',
    '!src/lib/integrations/**/template-renderer.ts',
    '!src/lib/integrations/index.ts',
    '!src/middleware/audit.ts',
    '!src/**/*.d.ts',
    '!src/**/*.schemas.ts',
    '!src/**/*.routes.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 75,
      branches: 50,
      functions: 75,
      statements: 75,
    },
    './src/modules/settlement/': {
      lines: 93,
      functions: 95,
      statements: 91,
    },
  },
};

export default config;
