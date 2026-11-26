// Общие константы e2e. Порты и адреса совпадают с tests/playwright.config.ts (webServer).

/** Backend напрямую (минуя прокси vite preview) — для подготовки данных через API. */
export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3100';

/** Mailpit REST API (docker axllent/mailpit, порт 8025). */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** Часовой пояс клиники (CLINIC_TZ в webServer). Браузер в тестах работает в нём же. */
export const CLINIC_TZ = 'Europe/Athens';

/** Уникальный суффикс для имён пациентов, email и логинов: БД общая на весь прогон. */
export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
