/** GET /api/clinic — пояс клиники для frontend (docs/plans/clinic-timezone.md, AC-TZ-01). */
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../backend/src/app.factory';

const LOGINS = [
  { role: 'root', login: 'root', password: 'root1234' },
  { role: 'admin', login: 'admin', password: 'admin1234' },
  { role: 'doctor', login: 'doctor1', password: 'doctor1234' },
] as const;

describe('GET /api/clinic', () => {
  const dirs: string[] = [];
  const apps: INestApplication[] = [];

  async function start(timezone?: string): Promise<INestApplication> {
    const dir = mkdtempSync(join(tmpdir(), 'clinic-tz-'));
    dirs.push(dir);
    const app = await createApp({ dbPath: join(dir, 'test.db'), mail: 'memory', seedDev: true, timezone });
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test('AC-TZ-01: гость без cookie → 200 {timezone: "Europe/Athens"} по умолчанию', async () => {
    const app = await start();
    const res = await request(app.getHttpServer()).get('/api/clinic');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timezone: 'Europe/Athens' });
  });

  test('AC-TZ-01: createApp({ timezone }) → тот же пояс в ответе', async () => {
    const app = await start('Asia/Tokyo');
    const res = await request(app.getHttpServer()).get('/api/clinic');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timezone: 'Asia/Tokyo' });
  });

  test.each(LOGINS)('AC-TZ-01: доступен роли $role и содержит только timezone', async ({ login, password }) => {
    const app = await start();
    const auth = await request(app.getHttpServer()).post('/api/auth/login').send({ login, password });
    expect(auth.status).toBe(200);
    const cookie = String(auth.headers['set-cookie'][0]).split(';')[0];

    const res = await request(app.getHttpServer()).get('/api/clinic').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['timezone']);
  });
});
