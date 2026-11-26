import { createApp, type CreateAppOptions } from './app.factory';

/** Параметры SMTP из env; незаданные значения остаются по умолчанию (app.options.ts). */
function smtpFromEnv(env: NodeJS.ProcessEnv): CreateAppOptions['smtp'] {
  return {
    ...(env.SMTP_HOST && { host: env.SMTP_HOST }),
    ...(env.SMTP_PORT && { port: Number(env.SMTP_PORT) }),
    ...(env.SMTP_SECURE && { secure: env.SMTP_SECURE === 'true' }),
    ...(env.SMTP_USER && { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' }),
    ...(env.SMTP_FROM && { from: env.SMTP_FROM }),
  };
}

async function bootstrap(): Promise<void> {
  const env = process.env;
  const app = await createApp({
    dbPath: env.DB_PATH || './data/clinic.db',
    mail: 'smtp',
    smtp: smtpFromEnv(env),
    appUrl: env.APP_URL || undefined,
    timezone: env.CLINIC_TZ || undefined,
    seedDev: env.SEED_DEV === 'true',
    staticDir: env.STATIC_DIR || undefined,
  });
  app.enableShutdownHooks();
  await app.listen(Number(env.PORT || 3000));
}

void bootstrap();
