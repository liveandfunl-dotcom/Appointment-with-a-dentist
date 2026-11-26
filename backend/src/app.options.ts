export type MailMode = 'smtp' | 'memory' | 'failing';

export interface CreateAppOptions {
  /** Путь к файлу SQLite. */
  dbPath: string;
  /** Источник текущего времени; в тестах подменяется. */
  now?: () => Date;
  /** smtp — nodemailer по env SMTP_*; memory — письма в MailService.outbox; failing — send() бросает ошибку. */
  mail: MailMode;
  /** Создавать dev-данные (врачи, администратор). */
  seedDev?: boolean;
  /** База ссылок в письмах; по умолчанию 'http://localhost:3000'. */
  appUrl?: string;
  /** Часовой пояс клиники (IANA); по умолчанию 'Europe/Athens'. */
  timezone?: string;
  /** Каталог собранного фронтенда; если задан — раздаётся как статика с SPA-fallback на index.html. */
  staticDir?: string;
}

/** Синоним CreateAppOptions (используется внутри бэкенда). */
export type AppOptions = CreateAppOptions;

/** DI-токен для опций createApp. */
export const APP_OPTIONS = Symbol('APP_OPTIONS');
