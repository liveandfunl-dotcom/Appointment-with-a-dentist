import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * E2E-тесты: tests/e2e/*.spec.ts.
 *
 * ВАЖНО: перед запуском должен быть поднят Mailpit (SMTP :1025, веб/API :8025):
 *   docker compose -f build/docker-compose.yml up mailpit
 * или
 *   docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
 * Тесты читают письма через API Mailpit: http://localhost:8025/api/v1/...
 *
 * webServer поднимает:
 *  - backend на :3100 с временной БД (удаляется перед стартом), SEED_DEV=true, SMTP → localhost:1025;
 *  - собранный фронтенд (vite build + vite preview) на :4173, /api проксируется на backend.
 */
const BACKEND_PORT = 3100;
const FRONTEND_PORT = 4173;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const E2E_DB_PATH = process.env.E2E_DB_PATH ?? join(tmpdir(), 'clinic-e2e', 'clinic.db');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      cwd: '..',
      command:
        'npm run build -w backend && node -e "require(\'node:fs\').rmSync(process.env.DB_PATH,{force:true})" && node backend/dist/main.js',
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(BACKEND_PORT),
        DB_PATH: E2E_DB_PATH,
        SEED_DEV: 'true',
        APP_URL: FRONTEND_URL,
        CLINIC_TZ: 'Europe/Athens',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_FROM: 'clinic@clinic.local',
      },
    },
    {
      cwd: '..',
      command: `npm run build -w frontend && npm run preview -w frontend -- --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { BACKEND_URL: `http://localhost:${BACKEND_PORT}` },
    },
  ],
});
