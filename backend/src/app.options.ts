export type MailMode = 'smtp' | 'memory' | 'failing';

/** Параметры SMTP (режим `mail: 'smtp'`). */
export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  /** Адрес отправителя. */
  from: string;
}

export interface CreateAppOptions {
  /** Путь к файлу SQLite. */
  dbPath: string;
  /** Источник текущего времени; в тестах подменяется. */
  now?: () => Date;
  /** smtp — nodemailer; memory — письма в MailService.outbox; failing — send() бросает ошибку. */
  mail: MailMode;
  /** Параметры SMTP; недостающие значения берутся из DEFAULT_SMTP. */
  smtp?: Partial<SmtpOptions>;
  /** Создавать dev-данные (врачи, администратор). */
  seedDev?: boolean;
  /** База ссылок в письмах; по умолчанию DEFAULT_APP_URL. */
  appUrl?: string;
  /** Часовой пояс клиники (IANA); по умолчанию DEFAULT_TIMEZONE. */
  timezone?: string;
  /** Каталог собранного фронтенда; если задан — раздаётся как статика с SPA-fallback на index.html. */
  staticDir?: string;
}

/** Опции приложения с подставленными значениями по умолчанию: их получают сервисы через `APP_OPTIONS`. */
export interface ResolvedAppOptions extends CreateAppOptions {
  smtp: SmtpOptions;
  seedDev: boolean;
  appUrl: string;
  timezone: string;
}

export const DEFAULT_APP_URL = 'http://localhost:3000';
export const DEFAULT_TIMEZONE = 'Europe/Athens';
export const DEFAULT_SMTP: SmtpOptions = {
  host: 'localhost',
  port: 1025,
  secure: false,
  from: 'Clinic <noreply@clinic.local>',
};

/** Единственное место, где задаются значения по умолчанию. */
export function resolveOptions(options: CreateAppOptions): ResolvedAppOptions {
  return {
    ...options,
    smtp: { ...DEFAULT_SMTP, ...options.smtp },
    seedDev: options.seedDev ?? false,
    appUrl: options.appUrl ?? DEFAULT_APP_URL,
    timezone: options.timezone ?? DEFAULT_TIMEZONE,
  };
}

/** DI-токен для опций createApp (тип — `ResolvedAppOptions`). */
export const APP_OPTIONS = Symbol('APP_OPTIONS');
