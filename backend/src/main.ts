import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const app = await createApp({
    dbPath: process.env.DB_PATH || './data/clinic.db',
    mail: 'smtp',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    timezone: process.env.CLINIC_TZ || 'Europe/Athens',
    seedDev: process.env.SEED_DEV === 'true',
    staticDir: process.env.STATIC_DIR || undefined,
  });
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
