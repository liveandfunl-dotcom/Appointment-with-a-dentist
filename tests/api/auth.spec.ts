// API-тесты аутентификации: AC-AUTH-01…13 (docs/plans/clinic-mvp.md).
// Контракт: docs/specs/system/api.md — 1.2 (коды ошибок), 3 (rate limit), 4.2–4.6 (маршруты auth),
// 4.10 (деактивация), 5 (письма), 6 (createApp, MailService).
import {
  ADMIN,
  APP_URL,
  DAY,
  DOCTOR1,
  DOCTOR2,
  MINUTE,
  ROOT,
  SESSION_MAX_AGE,
  type TestContext,
  cookieAttributes,
  deactivateDoctor1,
  extractMagicToken,
  login,
  loginAs,
  loginByMagicLink,
  magicToken,
  me,
  requestMagicLink,
  sessionCookie,
  sessionSetCookie,
  setActive,
  startApp,
  verifyToken,
} from './support/auth-helpers';

/** Проверяет Set-Cookie сессии: session=<token>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax (api.md 4.3). */
function expectSessionCookie(header: string | undefined): void {
  expect(header).toBeDefined();
  const value = header!.split(';')[0].slice('session='.length);
  expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const attrs = cookieAttributes(header!);
  expect(attrs['max-age']).toBe(String(SESSION_MAX_AGE));
  expect(attrs['path']).toBe('/');
  expect(attrs).toHaveProperty('httponly');
  expect(attrs['samesite']?.toLowerCase()).toBe('lax');
  expect(attrs).not.toHaveProperty('secure');
}

describe('auth', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await startApp();
  });

  afterEach(async () => {
    await ctx?.close();
  });

  // ---------------------------------------------------------------- magic-link (4.2)

  describe('POST /api/auth/magic-link', () => {
    test('AC-AUTH-01: активный email → 200 {ok:true}, письмо со ссылкой APP_URL/auth/magic?token=… (ru по умолчанию)', async () => {
      const res = await requestMagicLink(ctx, DOCTOR1.email);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(ctx.outbox).toHaveLength(1);
      const [letter] = ctx.outbox;
      expect(letter.to).toBe(DOCTOR1.email);
      expect(letter.subject).toBe('Вход в систему записи');
      expect(letter.text).toContain(`Здравствуйте, ${DOCTOR1.name}!`);
      expect(letter.text).toContain('Ссылка действует 30 минут и может быть использована один раз.');
      expect(letter.text).toMatch(/\/auth\/magic\?token=([A-Za-z0-9_-]+)/);
      const token = extractMagicToken(letter.text, APP_URL);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    test.each([
      ['ru', 'Вход в систему записи', `Здравствуйте, ${DOCTOR1.name}!`],
      ['en', 'Sign in to the appointment system', `Hello, ${DOCTOR1.name}!`],
      ['el', 'Σύνδεση στο σύστημα ραντεβού', `Γεια σας, ${DOCTOR1.name}!`],
    ])('AC-AUTH-01: письмо на языке lang=%s', async (lang, subject, greeting) => {
      const res = await requestMagicLink(ctx, DOCTOR1.email, lang);

      expect(res.status).toBe(200);
      expect(ctx.outbox).toHaveLength(1);
      expect(ctx.outbox[0].subject).toBe(subject);
      expect(ctx.outbox[0].text).toContain(greeting);
      expect(ctx.outbox[0].text).toContain(`${APP_URL}/auth/magic?token=`);
    });

    test('AC-AUTH-01: email обрезается и приводится к нижнему регистру', async () => {
      const res = await requestMagicLink(ctx, '  Doctor1@Clinic.LOCAL ');

      expect(res.status).toBe(200);
      expect(ctx.outbox).toHaveLength(1);
      expect(ctx.outbox[0].to).toBe(DOCTOR1.email);
    });

    test('AC-AUTH-01: неизвестный lang → 400 VALIDATION_ERROR fields ["lang"], письмо не отправляется', async () => {
      const res = await requestMagicLink(ctx, DOCTOR1.email, 'de');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields).toEqual(expect.arrayContaining(['lang']));
      expect(ctx.outbox).toHaveLength(0);
    });

    test('AC-AUTH-02: неизвестный email → 404 USER_NOT_FOUND, письмо не отправляется', async () => {
      const res = await requestMagicLink(ctx, 'nobody@clinic.local');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'USER_NOT_FOUND' });
      expect(ctx.outbox).toHaveLength(0);
    });

    test('AC-AUTH-02: email деактивированного пользователя → 404 USER_NOT_FOUND, письмо не отправляется', async () => {
      await deactivateDoctor1(ctx);

      const res = await requestMagicLink(ctx, DOCTOR1.email);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'USER_NOT_FOUND' });
      expect(ctx.outbox).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- verify (4.3)

  describe('POST /api/auth/magic-link/verify', () => {
    test('AC-AUTH-03: действующий токен → 200 {user}, httpOnly cookie session на 30 дней', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);

      const res = await verifyToken(ctx, token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { id: expect.any(Number), surname: DOCTOR1.surname, name: DOCTOR1.name, role: 'doctor' },
      });
      expectSessionCookie(sessionSetCookie(res));

      const meRes = await me(ctx, sessionCookie(res));
      expect(meRes.status).toBe(200);
      expect(meRes.body).toEqual(res.body.user);
    });

    test('AC-AUTH-03: без token → 400 VALIDATION_ERROR fields ["token"]', async () => {
      const res = await ctx.http().post('/api/auth/magic-link/verify').send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields).toEqual(expect.arrayContaining(['token']));
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('AC-AUTH-04: токен старше 30 минут (+31 мин) → 401 LINK_EXPIRED, cookie не ставится', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);
      ctx.clock.advance(31 * MINUTE);

      const res = await verifyToken(ctx, token);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'LINK_EXPIRED' });
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('AC-AUTH-04: ровно 30 минут → 401 LINK_EXPIRED (now >= expiresAt)', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);
      ctx.clock.advance(30 * MINUTE);

      const res = await verifyToken(ctx, token);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'LINK_EXPIRED' });
    });

    test('AC-AUTH-04: через 29 минут токен ещё действует → 200', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);
      ctx.clock.advance(29 * MINUTE);

      const res = await verifyToken(ctx, token);

      expect(res.status).toBe(200);
      expectSessionCookie(sessionSetCookie(res));
    });

    test('AC-AUTH-05: повторно использованный токен → 401 LINK_INVALID', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);
      const first = await verifyToken(ctx, token);
      expect(first.status).toBe(200);

      const second = await verifyToken(ctx, token);

      expect(second.status).toBe(401);
      expect(second.body).toEqual({ code: 'LINK_INVALID' });
      expect(sessionSetCookie(second)).toBeUndefined();
    });

    test('AC-AUTH-05: использованный и просроченный токен → LINK_INVALID (проверка «использован» раньше «просрочен»)', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);
      expect((await verifyToken(ctx, token)).status).toBe(200);
      ctx.clock.advance(31 * MINUTE);

      const res = await verifyToken(ctx, token);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'LINK_INVALID' });
    });

    test('AC-AUTH-05: неизвестный токен → 401 LINK_INVALID', async () => {
      const res = await verifyToken(ctx, 'A'.repeat(43));

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'LINK_INVALID' });
    });

    test('AC-AUTH-05: ссылка пользователя, деактивированного после её получения → 401 LINK_INVALID', async () => {
      const token = await magicToken(ctx, DOCTOR1.email);
      await deactivateDoctor1(ctx);

      const res = await verifyToken(ctx, token);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'LINK_INVALID' });
      expect(sessionSetCookie(res)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------- login (4.4)

  describe('POST /api/auth/login', () => {
    test('AC-AUTH-06: root/root1234 → 200 {user}, httpOnly cookie session на 30 дней', async () => {
      const res = await login(ctx, ROOT.login, ROOT.password);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { id: expect.any(Number), surname: 'Root', name: 'System', role: 'root' },
      });
      expectSessionCookie(sessionSetCookie(res));

      const meRes = await me(ctx, sessionCookie(res));
      expect(meRes.status).toBe(200);
      expect(meRes.body).toEqual(res.body.user);
    });

    test.each([
      [DOCTOR1.login, 'doctor', DOCTOR1.password],
      [ADMIN.login, 'admin', ADMIN.password],
    ])('AC-AUTH-06: сидовый пользователь %s входит по паролю (роль %s)', async (loginValue, role, password) => {
      const res = await login(ctx, loginValue, password);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(expect.objectContaining({ role }));
      expectSessionCookie(sessionSetCookie(res));
    });

    test('AC-AUTH-06: логин обрезается (trim)', async () => {
      const res = await login(ctx, '  root ', ROOT.password);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('root');
    });

    test('AC-AUTH-07: неверный пароль → 401 INVALID_CREDENTIALS, cookie не ставится', async () => {
      const res = await login(ctx, ROOT.login, 'wrong-password');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS' });
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('AC-AUTH-07: неизвестный логин → 401 INVALID_CREDENTIALS', async () => {
      const res = await login(ctx, 'ghost', 'whatever123');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS' });
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('AC-AUTH-07: логин регистрозависимый (ROOT) → 401 INVALID_CREDENTIALS', async () => {
      const res = await login(ctx, 'ROOT', ROOT.password);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS' });
    });

    test('AC-AUTH-07: деактивированный пользователь с верным паролем → 401 INVALID_CREDENTIALS', async () => {
      await deactivateDoctor1(ctx);

      const res = await login(ctx, DOCTOR1.login, DOCTOR1.password);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS' });
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    test('AC-AUTH-07: пустой логин или пароль → 400 VALIDATION_ERROR', async () => {
      const noLogin = await login(ctx, '', ROOT.password);
      expect(noLogin.status).toBe(400);
      expect(noLogin.body.code).toBe('VALIDATION_ERROR');
      expect(noLogin.body.fields).toEqual(expect.arrayContaining(['login']));

      const noPassword = await ctx.http().post('/api/auth/login').send({ login: ROOT.login });
      expect(noPassword.status).toBe(400);
      expect(noPassword.body.code).toBe('VALIDATION_ERROR');
      expect(noPassword.body.fields).toEqual(expect.arrayContaining(['password']));
    });
  });

  // ---------------------------------------------------------------- me (4.6)

  describe('GET /api/auth/me', () => {
    test('AC-AUTH-08: с cookie → 200 ровно {id, surname, name, role}', async () => {
      const { cookie, user } = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);

      const res = await me(ctx, cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: user.id, surname: DOCTOR1.surname, name: DOCTOR1.name, role: 'doctor' });
      expect(Object.keys(res.body).sort()).toEqual(['id', 'name', 'role', 'surname']);
    });

    test('AC-AUTH-08: без cookie → 401 UNAUTHORIZED', async () => {
      const res = await me(ctx);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    test('AC-AUTH-08: неизвестная сессия в cookie → 401 UNAUTHORIZED', async () => {
      const res = await me(ctx, `session=${'B'.repeat(43)}`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    test('AC-AUTH-09: через 30 дней сессия истекает → 401 UNAUTHORIZED', async () => {
      const { cookie } = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
      ctx.clock.advance(30 * DAY);

      const res = await me(ctx, cookie);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    test('AC-AUTH-09: сессия не продлевается при активности (29 дней → 200, 30 дней → 401)', async () => {
      const { cookie } = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);

      ctx.clock.advance(29 * DAY);
      expect((await me(ctx, cookie)).status).toBe(200);

      ctx.clock.advance(1 * DAY);
      const res = await me(ctx, cookie);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    test('AC-AUTH-09: сессия из magic link тоже истекает через 30 дней', async () => {
      const { cookie } = await loginByMagicLink(ctx, DOCTOR1.email);
      ctx.clock.advance(30 * DAY);

      const res = await me(ctx, cookie);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });
  });

  // ---------------------------------------------------------------- logout (4.5)

  describe('POST /api/auth/logout', () => {
    test('AC-AUTH-10: после logout сессия недействительна, cookie сбрасывается', async () => {
      const { cookie } = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
      expect((await me(ctx, cookie)).status).toBe(200);

      const res = await ctx.http().post('/api/auth/logout').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      const cleared = sessionSetCookie(res);
      expect(cleared).toBeDefined();
      expect(cleared!.split(';')[0]).toBe('session=');
      const attrs = cookieAttributes(cleared!);
      expect(attrs['max-age']).toBe('0');
      expect(attrs['path']).toBe('/');
      expect(attrs).toHaveProperty('httponly');

      const after = await me(ctx, cookie);
      expect(after.status).toBe(401);
      expect(after.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    test('AC-AUTH-10: logout без cookie идемпотентен → 200 {ok:true}', async () => {
      const res = await ctx.http().post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(sessionSetCookie(res)).toBeDefined();
    });

    test('AC-AUTH-10: logout завершает только текущую сессию', async () => {
      const first = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
      const second = await loginByMagicLink(ctx, DOCTOR1.email);

      const res = await ctx.http().post('/api/auth/logout').set('Cookie', first.cookie);
      expect(res.status).toBe(200);

      expect((await me(ctx, first.cookie)).status).toBe(401);
      expect((await me(ctx, second.cookie)).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------- rate limit magic-link (3)

  describe('rate limit: POST /api/auth/magic-link', () => {
    test('AC-AUTH-11: 6-й запрос на один email за 15 минут → 429 TOO_MANY_REQUESTS, письмо не уходит', async () => {
      // Идентификатор нормализуется (trim + lowercase): все варианты — один счётчик.
      const variants = [DOCTOR1.email, 'DOCTOR1@clinic.local', ` ${DOCTOR1.email} `, DOCTOR1.email, 'Doctor1@Clinic.Local'];
      for (const email of variants) {
        const res = await requestMagicLink(ctx, email);
        expect(res.status).toBe(200);
      }
      expect(ctx.outbox).toHaveLength(5);

      const sixth = await requestMagicLink(ctx, DOCTOR1.email);

      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({ code: 'TOO_MANY_REQUESTS' });
      expect(ctx.outbox).toHaveLength(5);

      // Другой email с того же IP обрабатывается.
      const other = await requestMagicLink(ctx, DOCTOR2.email);
      expect(other.status).toBe(200);
    });

    test('AC-AUTH-11: в счётчик идут и неуспешные ответы (404) → 6-й запрос 429', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await requestMagicLink(ctx, 'nobody@clinic.local');
        expect(res.status).toBe(404);
      }

      const sixth = await requestMagicLink(ctx, 'nobody@clinic.local');

      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({ code: 'TOO_MANY_REQUESTS' });
    });

    test('AC-AUTH-11: 21-й запрос с одного IP (разные email) → 429 TOO_MANY_REQUESTS', async () => {
      for (let i = 1; i <= 20; i++) {
        const res = await requestMagicLink(ctx, `user${i}@clinic.local`);
        expect(res.status).toBe(404);
      }

      const blocked = await requestMagicLink(ctx, DOCTOR1.email);

      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({ code: 'TOO_MANY_REQUESTS' });
      expect(ctx.outbox).toHaveLength(0);
    });

    test('AC-AUTH-11: через 15 минут лимит на email снова пускает (14 мин → 429, 15 мин → 200)', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(200);
      }

      ctx.clock.advance(14 * MINUTE);
      expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(429);

      ctx.clock.advance(1 * MINUTE);
      const res = await requestMagicLink(ctx, DOCTOR1.email);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    test('AC-AUTH-11: через 15 минут лимит на IP снова пускает', async () => {
      for (let i = 1; i <= 20; i++) {
        expect((await requestMagicLink(ctx, `user${i}@clinic.local`)).status).toBe(404);
      }
      expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(429);

      ctx.clock.advance(15 * MINUTE);

      const res = await requestMagicLink(ctx, DOCTOR1.email);
      expect(res.status).toBe(200);
    });

    test('AC-AUTH-11: отклонённые (429) запросы не записываются в счётчик', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(200);
      }
      // Через 10 минут ещё 5 запросов — все 429; если бы они считались, окно не освободилось бы ещё 10 минут.
      ctx.clock.advance(10 * MINUTE);
      for (let i = 0; i < 5; i++) {
        expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(429);
      }

      ctx.clock.advance(5 * MINUTE);
      expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------- rate limit login (3)

  describe('rate limit: POST /api/auth/login', () => {
    test('AC-AUTH-12: 6-й запрос на один логин за 15 минут → 429 даже с верным паролем', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await login(ctx, ROOT.login, 'wrong-password');
        expect(res.status).toBe(401);
      }

      const sixth = await login(ctx, ROOT.login, ROOT.password);

      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({ code: 'TOO_MANY_REQUESTS' });
      expect(sessionSetCookie(sixth)).toBeUndefined();

      // Другой логин с того же IP обрабатывается.
      const other = await login(ctx, DOCTOR1.login, DOCTOR1.password);
      expect(other.status).toBe(200);
    });

    test('AC-AUTH-12: успешные входы тоже считаются → 6-й вход 429', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await login(ctx, ROOT.login, ROOT.password)).status).toBe(200);
      }

      const sixth = await login(ctx, ROOT.login, ROOT.password);

      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({ code: 'TOO_MANY_REQUESTS' });
    });

    test('AC-AUTH-12: 21-й запрос с одного IP (разные логины) → 429 TOO_MANY_REQUESTS', async () => {
      for (let i = 1; i <= 20; i++) {
        const res = await login(ctx, `ghost${i}`, 'whatever123');
        expect(res.status).toBe(401);
      }

      const blocked = await login(ctx, ROOT.login, ROOT.password);

      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({ code: 'TOO_MANY_REQUESTS' });
      expect(sessionSetCookie(blocked)).toBeUndefined();
    });

    test('AC-AUTH-12: через 15 минут лимит на логин и на IP снова пускает', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await login(ctx, ROOT.login, 'wrong-password')).status).toBe(401);
      }
      for (let i = 1; i <= 15; i++) {
        expect((await login(ctx, `ghost${i}`, 'whatever123')).status).toBe(401);
      }
      expect((await login(ctx, ROOT.login, ROOT.password)).status).toBe(429);
      expect((await login(ctx, DOCTOR1.login, DOCTOR1.password)).status).toBe(429);

      ctx.clock.advance(14 * MINUTE);
      expect((await login(ctx, ROOT.login, ROOT.password)).status).toBe(429);

      ctx.clock.advance(1 * MINUTE);
      const res = await login(ctx, ROOT.login, ROOT.password);
      expect(res.status).toBe(200);
      expectSessionCookie(sessionSetCookie(res));
    });

    test('AC-AUTH-12: исчерпанный лимит IP на magic-link не блокирует login', async () => {
      for (let i = 1; i <= 20; i++) {
        expect((await requestMagicLink(ctx, `user${i}@clinic.local`)).status).toBe(404);
      }
      expect((await requestMagicLink(ctx, DOCTOR1.email)).status).toBe(429);

      const res = await login(ctx, ROOT.login, ROOT.password);
      expect(res.status).toBe(200);
    });

    test('AC-AUTH-12: исчерпанный лимит IP на login не блокирует magic-link', async () => {
      for (let i = 1; i <= 20; i++) {
        expect((await login(ctx, `ghost${i}`, 'whatever123')).status).toBe(401);
      }
      expect((await login(ctx, ROOT.login, ROOT.password)).status).toBe(429);

      const res = await requestMagicLink(ctx, DOCTOR1.email);
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------- деактивация (4.10)

  describe('деактивация пользователя', () => {
    test('AC-AUTH-13: PATCH isActive=false завершает все сессии пользователя → 401 на /api/auth/me', async () => {
      const root = await loginAs(ctx, ROOT.login, ROOT.password);
      const byPassword = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
      const byMagicLink = await loginByMagicLink(ctx, DOCTOR1.email);
      expect((await me(ctx, byPassword.cookie)).status).toBe(200);
      expect((await me(ctx, byMagicLink.cookie)).status).toBe(200);

      await setActive(ctx, root.cookie, byPassword.user.id, false);

      for (const cookie of [byPassword.cookie, byMagicLink.cookie]) {
        const res = await me(ctx, cookie);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
      }
    });

    test('AC-AUTH-13: сессии удалены — после повторной активации старые cookie не работают, новый вход работает', async () => {
      const root = await loginAs(ctx, ROOT.login, ROOT.password);
      const doctor = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);

      await setActive(ctx, root.cookie, doctor.user.id, false);
      await setActive(ctx, root.cookie, doctor.user.id, true);

      const old = await me(ctx, doctor.cookie);
      expect(old.status).toBe(401);
      expect(old.body).toEqual({ code: 'UNAUTHORIZED' });

      const fresh = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
      expect((await me(ctx, fresh.cookie)).status).toBe(200);
    });

    test('AC-AUTH-13: сессии других пользователей не затрагиваются', async () => {
      const root = await loginAs(ctx, ROOT.login, ROOT.password);
      const doctor1 = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
      const doctor2 = await loginAs(ctx, DOCTOR2.login, DOCTOR2.password);

      await setActive(ctx, root.cookie, doctor1.user.id, false);

      expect((await me(ctx, doctor2.cookie)).status).toBe(200);
      expect((await me(ctx, root.cookie)).status).toBe(200);
    });
  });
});
