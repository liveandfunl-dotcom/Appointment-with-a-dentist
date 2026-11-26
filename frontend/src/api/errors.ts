import { ApiError } from './client';

/**
 * i18n-ключ сообщения для ошибки API. `specific` — ключи для кодов конкретного экрана;
 * `TOO_MANY_REQUESTS` и всё остальное (включая сетевые сбои) сводятся к общим ключам.
 * Хранить в state нужно ключ, а переводить при рендере: тогда сообщение меняет язык вместе с интерфейсом.
 */
export function apiErrorKey(error: unknown, specific: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    if (specific[error.code]) return specific[error.code];
    if (error.code === 'TOO_MANY_REQUESTS') return 'common.tooManyRequests';
  }
  return 'common.genericError';
}
