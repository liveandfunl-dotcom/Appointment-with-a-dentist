// API-тесты модуля users: AC-USERS-01…11 (docs/plans/clinic-mvp.md).
// Контракт: docs/specs/system/api.md, разделы 1, 2.2, 2.3, 4.7–4.10; сиды — data-model.md, раздел 4.
import {
  ADMIN,
  ADMIN_EMAIL,
  DOCTOR1,
  DOCTOR_EMAILS,
  ROOT,
  ROOT_EMAIL,
  adminPayload,
  appointmentPayload,
  call,
  doctorPayload,
  expectError,
  expectNoSecrets,
  expectPublicCard,
  listUsers,
  loginAs,
  meId,
  startUsersApp,
  stopUsersApp,
  tryLogin,
  userIdByEmail,
  type UsersTestContext,
} from './support/users-helpers';

jest.setTimeout(20_000);

const DOCTOR1_EMAIL = 'doctor1@clinic.local';
const DOCTOR2_EMAIL = 'doctor2@clinic.local';

describe('users API', () => {
  let ctx: UsersTestContext;

  beforeEach(async () => {
    ctx = await startUsersApp();
  });

  afterEach(async () => {
    await stopUsersApp(ctx);
  });

  /** Деактивирует пользователя от имени admin (PATCH isActive=false). */
  async function deactivate(email: string): Promise<number> {
    const root = await loginAs(ctx, ROOT);
    const admin = await loginAs(ctx, ADMIN);
    const id = await userIdByEmail(ctx, root, email);
    const res = await call(ctx, 'patch', `/api/users/${id}`, admin, { isActive: false });
    if (res.status !== 200) throw new Error(`deactivate ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return id;
  }

  // ---------------------------------------------------------------------------
  describe('AC-USERS-01: публичный список — только активные врачи', () => {
    test('AC-USERS-01: гость получает 5 активных врачей с полями карточки, без login/pass', async () => {
      const res = await call(ctx, 'get', '/api/users');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const cards = res.body as Record<string, unknown>[];

      expect(cards.map((c) => c.email).sort()).toEqual([...DOCTOR_EMAILS].sort());
      for (const card of cards) {
        expectPublicCard(card);
        expect(card).toMatchObject({ role: 'doctor', isActive: true });
      }

      const doctor1 = cards.find((c) => c.email === DOCTOR1_EMAIL);
      expect(doctor1).toMatchObject({
        surname: 'Иванов',
        name: 'Иван',
        role: 'doctor',
        specialization: 'Терапевт',
        phone: '+30 210 000 0001',
        email: DOCTOR1_EMAIL,
        room: 101,
        workDays: [1, 2, 3, 4, 5],
        workStart: '09:00',
        workEnd: '17:00',
        isActive: true,
      });
      expect(typeof doctor1?.id).toBe('number');
    });

    test('AC-USERS-01: врач получает тот же состав, что и гость (без админов и root)', async () => {
      const doctor = await loginAs(ctx, DOCTOR1);
      const res = await call(ctx, 'get', '/api/users', doctor);
      expect(res.status).toBe(200);
      const cards = res.body as Record<string, unknown>[];
      expect(cards.map((c) => c.email).sort()).toEqual([...DOCTOR_EMAILS].sort());
      for (const card of cards) {
        expectPublicCard(card);
        expect(card.role).toBe('doctor');
      }
    });

    test('AC-USERS-01: деактивированный врач не виден гостю и врачу', async () => {
      await deactivate(DOCTOR2_EMAIL);
      const doctor = await loginAs(ctx, DOCTOR1);

      const guestCards = await listUsers(ctx);
      const doctorCards = await listUsers(ctx, doctor);
      const expected = DOCTOR_EMAILS.filter((e) => e !== DOCTOR2_EMAIL).sort();

      expect(guestCards.map((c) => c.email).sort()).toEqual(expected);
      expect(doctorCards.map((c) => c.email).sort()).toEqual(expected);
      for (const card of [...guestCards, ...doctorCards]) expect(card.isActive).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-02: список для admin и root', () => {
    test('AC-USERS-02: admin видит и деактивированных врачей с isActive=false, но не админов и root', async () => {
      await deactivate(DOCTOR2_EMAIL);
      const admin = await loginAs(ctx, ADMIN);

      const res = await call(ctx, 'get', '/api/users', admin);
      expect(res.status).toBe(200);
      const cards = res.body as Record<string, unknown>[];

      expect(cards.map((c) => c.email).sort()).toEqual([...DOCTOR_EMAILS].sort());
      for (const card of cards) {
        expectPublicCard(card);
        expect(card.role).toBe('doctor');
      }
      expect(cards.find((c) => c.email === DOCTOR2_EMAIL)).toMatchObject({ isActive: false });
      expect(cards.find((c) => c.email === DOCTOR1_EMAIL)).toMatchObject({ isActive: true });
    });

    test('AC-USERS-02: root видит врачей (в т.ч. деактивированных) и админов с role; root в списке нет', async () => {
      await deactivate(DOCTOR2_EMAIL);
      const root = await loginAs(ctx, ROOT);

      const res = await call(ctx, 'get', '/api/users', root);
      expect(res.status).toBe(200);
      const cards = res.body as Record<string, unknown>[];

      expect(cards.map((c) => c.email).sort()).toEqual([ADMIN_EMAIL, ...DOCTOR_EMAILS].sort());
      expect(cards.some((c) => c.email === ROOT_EMAIL || c.role === 'root')).toBe(false);
      for (const card of cards) expectPublicCard(card);

      expect(cards.find((c) => c.email === ADMIN_EMAIL)).toMatchObject({
        role: 'admin',
        surname: 'Админова',
        name: 'Елена',
        phone: '+30 210 000 0100',
        specialization: null,
        room: null,
        workDays: [],
        workStart: null,
        workEnd: null,
        isActive: true,
      });
      expect(cards.find((c) => c.email === DOCTOR2_EMAIL)).toMatchObject({ role: 'doctor', isActive: false });
    });

    test('AC-USERS-02: admin, созданный root, виден root, но не admin и не гостю', async () => {
      const root = await loginAs(ctx, ROOT);
      const created = await call(ctx, 'post', '/api/users', root, adminPayload());
      expect(created.status).toBe(201);

      const admin = await loginAs(ctx, ADMIN);
      expect((await listUsers(ctx, root)).map((c) => c.email)).toContain('admin2@clinic.local');
      expect((await listUsers(ctx, admin)).map((c) => c.email)).not.toContain('admin2@clinic.local');
      expect((await listUsers(ctx)).map((c) => c.email)).not.toContain('admin2@clinic.local');
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-03: создание врача и валидация', () => {
    test('AC-USERS-03: admin создаёт врача → 201 UserDetails без пароля, врач появляется в списке', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(ctx, 'post', '/api/users', admin, doctorPayload());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        role: 'doctor',
        surname: 'Сидоров',
        name: 'Сергей',
        phone: '+30 210 000 0042',
        email: 'new.doctor@clinic.local',
        specialization: 'Терапевт',
        room: 201,
        workDays: [1, 2, 3, 4, 5],
        workStart: '09:00',
        workEnd: '17:00',
        login: 'sidorov',
        isActive: true,
      });
      expect(typeof res.body.id).toBe('number');
      expectNoSecrets(res.body);

      const guestCards = await listUsers(ctx);
      const card = guestCards.find((c) => c.email === 'new.doctor@clinic.local');
      expect(card).toBeDefined();
      expectPublicCard(card as Record<string, unknown>);

      const login = await tryLogin(ctx, { login: 'sidorov', password: 'secret123' });
      expect(login.status).toBe(200);
    });

    test('AC-USERS-03: root тоже создаёт врача → 201', async () => {
      const root = await loginAs(ctx, ROOT);
      const res = await call(ctx, 'post', '/api/users', root, doctorPayload());
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ role: 'doctor', email: 'new.doctor@clinic.local' });
    });

    test('AC-USERS-03: строки обрезаются, email приводится к нижнему регистру, врач без логина → login=null', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(
        ctx,
        'post',
        '/api/users',
        admin,
        doctorPayload({
          surname: '  Сидоров  ',
          email: '  New.Doctor@Clinic.LOCAL ',
          login: undefined,
          password: undefined,
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ surname: 'Сидоров', email: 'new.doctor@clinic.local', login: null });
      expectNoSecrets(res.body);
    });

    test('AC-USERS-03: пустое тело врача → 400 VALIDATION_ERROR со всеми обязательными полями', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(ctx, 'post', '/api/users', admin, { role: 'doctor' });
      expectError(res, 400, 'VALIDATION_ERROR', [
        'surname',
        'name',
        'phone',
        'email',
        'specialization',
        'room',
        'workDays',
        'workStart',
        'workEnd',
      ]);
    });

    test('AC-USERS-03: неверный email → 400 VALIDATION_ERROR fields ⊇ [email]', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const email of ['not-an-email', 'a@b', 'a b@clinic.local', '']) {
        const res = await call(ctx, 'post', '/api/users', admin, doctorPayload({ email }));
        expectError(res, 400, 'VALIDATION_ERROR', ['email']);
      }
    });

    test('AC-USERS-03: пустые после trim surname/name/phone/specialization → 400 с этими полями', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(
        ctx,
        'post',
        '/api/users',
        admin,
        doctorPayload({ surname: '   ', name: '', phone: ' ', specialization: '  ' }),
      );
      expectError(res, 400, 'VALIDATION_ERROR', ['surname', 'name', 'phone', 'specialization']);
      expect(res.body.fields).not.toContain('email');
    });

    test('AC-USERS-03: room не целое ≥ 1 → 400 fields ⊇ [room]', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const room of [0, -1, 1.5, '101']) {
        const res = await call(ctx, 'post', '/api/users', admin, doctorPayload({ room }));
        expectError(res, 400, 'VALIDATION_ERROR', ['room']);
      }
    });

    test('AC-USERS-03: role отсутствует или неизвестна → 400 fields ⊇ [role]', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const role of [undefined, 'root', 'nurse']) {
        const res = await call(ctx, 'post', '/api/users', admin, doctorPayload({ role }));
        expectError(res, 400, 'VALIDATION_ERROR', ['role']);
      }
    });

    test('AC-USERS-03: login без password и password без login → 400 fields ⊇ [password]', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const noPass = await call(ctx, 'post', '/api/users', admin, doctorPayload({ password: undefined }));
      expectError(noPass, 400, 'VALIDATION_ERROR', ['password']);

      const noLogin = await call(ctx, 'post', '/api/users', admin, doctorPayload({ login: undefined }));
      expectError(noLogin, 400, 'VALIDATION_ERROR', ['password']);

      const shortPass = await call(ctx, 'post', '/api/users', admin, doctorPayload({ password: 'short' }));
      expectError(shortPass, 400, 'VALIDATION_ERROR', ['password']);

      const badLogin = await call(ctx, 'post', '/api/users', admin, doctorPayload({ login: 'a b' }));
      expectError(badLogin, 400, 'VALIDATION_ERROR', ['login']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-04: рабочие дни и время', () => {
    async function create(overrides: Record<string, unknown>) {
      const admin = await loginAs(ctx, ADMIN);
      return call(ctx, 'post', '/api/users', admin, doctorPayload(overrides));
    }

    test('AC-USERS-04: workStart > workEnd → 400 fields ⊇ [workEnd]', async () => {
      const res = await create({ workStart: '17:00', workEnd: '09:00' });
      expectError(res, 400, 'VALIDATION_ERROR', ['workEnd']);
    });

    test('AC-USERS-04: workStart = workEnd → 400 fields ⊇ [workEnd]', async () => {
      const res = await create({ workStart: '09:00', workEnd: '09:00' });
      expectError(res, 400, 'VALIDATION_ERROR', ['workEnd']);
    });

    test('AC-USERS-04: время не кратно 30 минутам → 400', async () => {
      expectError(await create({ workStart: '09:15' }), 400, 'VALIDATION_ERROR', ['workStart']);
      expectError(await create({ workEnd: '17:10' }), 400, 'VALIDATION_ERROR', ['workEnd']);
    });

    test('AC-USERS-04: время вне 00:00–24:00 или не в формате HH:mm → 400', async () => {
      expectError(await create({ workEnd: '24:30' }), 400, 'VALIDATION_ERROR', ['workEnd']);
      expectError(await create({ workEnd: '25:00' }), 400, 'VALIDATION_ERROR', ['workEnd']);
      expectError(await create({ workStart: '-01:00' }), 400, 'VALIDATION_ERROR', ['workStart']);
      expectError(await create({ workStart: 540 }), 400, 'VALIDATION_ERROR', ['workStart']);
      expectError(await create({ workStart: '9:00' }), 400, 'VALIDATION_ERROR', ['workStart']);
    });

    test('AC-USERS-04: границы 00:00–24:00 допустимы → 201', async () => {
      const res = await create({ workStart: '00:00', workEnd: '24:00' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ workStart: '00:00', workEnd: '24:00' });
    });

    test('AC-USERS-04: не выбран ни один день → 400 fields ⊇ [workDays]', async () => {
      expectError(await create({ workDays: [] }), 400, 'VALIDATION_ERROR', ['workDays']);
    });

    test('AC-USERS-04: дни вне 1…7, повторы или не массив → 400 fields ⊇ [workDays]', async () => {
      for (const workDays of [[0], [8], [1, 1], '1,2,3', [1.5]]) {
        expectError(await create({ workDays }), 400, 'VALIDATION_ERROR', ['workDays']);
      }
    });

    test('AC-USERS-04: дни в ответе отсортированы по возрастанию', async () => {
      const res = await create({ workDays: [5, 1, 3] });
      expect(res.status).toBe(201);
      expect(res.body.workDays).toEqual([1, 3, 5]);
    });

    test('AC-USERS-04: PATCH проверяет workStart < workEnd по итоговым значениям', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL); // 09:00–17:00

      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { workEnd: '08:00' }), 400, 'VALIDATION_ERROR', [
        'workEnd',
      ]);
      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { workStart: '17:00' }), 400, 'VALIDATION_ERROR');
      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { workDays: [] }), 400, 'VALIDATION_ERROR', [
        'workDays',
      ]);
      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { workStart: '09:45' }), 400, 'VALIDATION_ERROR', [
        'workStart',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-05: уникальность email и логина', () => {
    test('AC-USERS-05: занятый email → 409 EMAIL_TAKEN fields [email] (без учёта регистра)', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const email of [DOCTOR1_EMAIL, 'DOCTOR1@Clinic.Local', ROOT_EMAIL]) {
        const res = await call(ctx, 'post', '/api/users', admin, doctorPayload({ email }));
        expectError(res, 409, 'EMAIL_TAKEN', ['email']);
      }
    });

    test('AC-USERS-05: занятый логин → 409 LOGIN_TAKEN fields [login]', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const login of ['doctor1', 'admin', 'root']) {
        const res = await call(ctx, 'post', '/api/users', admin, doctorPayload({ login }));
        expectError(res, 409, 'LOGIN_TAKEN', ['login']);
      }
    });

    test('AC-USERS-05: заняты и email, и логин → 409 EMAIL_TAKEN', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(ctx, 'post', '/api/users', admin, doctorPayload({ email: DOCTOR1_EMAIL, login: 'doctor1' }));
      expectError(res, 409, 'EMAIL_TAKEN', ['email']);
    });

    test('AC-USERS-05: PATCH на чужой email/логин → 409; свой email — 200', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR2_EMAIL);

      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { email: DOCTOR1_EMAIL }), 409, 'EMAIL_TAKEN', [
        'email',
      ]);
      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { login: 'doctor1' }), 409, 'LOGIN_TAKEN', [
        'login',
      ]);

      const same = await call(ctx, 'patch', `/api/users/${id}`, admin, { email: DOCTOR2_EMAIL, login: 'doctor2' });
      expect(same.status).toBe(200);
      expect(same.body).toMatchObject({ email: DOCTOR2_EMAIL, login: 'doctor2' });
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-06: создание администратора', () => {
    test('AC-USERS-06: admin не может создать админа → 403 FORBIDDEN', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(ctx, 'post', '/api/users', admin, adminPayload());
      expectError(res, 403, 'FORBIDDEN');
    });

    test('AC-USERS-06: admin + role=admin с невалидными прочими полями → всё равно 403 (роль до остальных полей)', async () => {
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(ctx, 'post', '/api/users', admin, { role: 'admin' });
      expectError(res, 403, 'FORBIDDEN');
    });

    test('AC-USERS-06: root создаёт админа без полей врача → 201, поля врача пустые', async () => {
      const root = await loginAs(ctx, ROOT);
      const res = await call(ctx, 'post', '/api/users', root, adminPayload());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        role: 'admin',
        surname: 'Петров',
        name: 'Пётр',
        phone: '+30 210 000 0200',
        email: 'admin2@clinic.local',
        specialization: null,
        room: null,
        workDays: [],
        workStart: null,
        workEnd: null,
        login: null,
        isActive: true,
      });
      expectNoSecrets(res.body);
    });

    test('AC-USERS-06: поля врача у админа игнорируются, даже невалидные', async () => {
      const root = await loginAs(ctx, ROOT);
      const res = await call(
        ctx,
        'post',
        '/api/users',
        root,
        adminPayload({ specialization: 'X', room: 5, workDays: [], workStart: '17:00', workEnd: '09:00' }),
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ specialization: null, room: null, workDays: [], workStart: null, workEnd: null });
    });

    test('AC-USERS-06: админ, созданный root с логином, входит с role=admin', async () => {
      const root = await loginAs(ctx, ROOT);
      const res = await call(ctx, 'post', '/api/users', root, adminPayload({ login: 'admin2', password: 'secret123' }));
      expect(res.status).toBe(201);
      expect(res.body.login).toBe('admin2');

      const login = await tryLogin(ctx, { login: 'admin2', password: 'secret123' });
      expect(login.status).toBe(200);
      expect(login.body.user).toMatchObject({ role: 'admin', surname: 'Петров', name: 'Пётр' });
    });

    test('AC-USERS-06: обязательные поля админа проверяются → 400', async () => {
      const root = await loginAs(ctx, ROOT);
      const res = await call(ctx, 'post', '/api/users', root, { role: 'admin' });
      expectError(res, 400, 'VALIDATION_ERROR', ['surname', 'name', 'phone', 'email']);
      for (const field of ['specialization', 'room', 'workDays', 'workStart', 'workEnd']) {
        expect(res.body.fields).not.toContain(field);
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-07: врач и гость не управляют пользователями', () => {
    test('AC-USERS-07: врач → 403 FORBIDDEN на POST /api/users (даже с невалидным телом)', async () => {
      const doctor = await loginAs(ctx, DOCTOR1);
      expectError(await call(ctx, 'post', '/api/users', doctor, doctorPayload()), 403, 'FORBIDDEN');
      expectError(await call(ctx, 'post', '/api/users', doctor, {}), 403, 'FORBIDDEN');
    });

    test('AC-USERS-07: врач → 403 FORBIDDEN на PATCH (себя, другого, несуществующего)', async () => {
      const root = await loginAs(ctx, ROOT);
      const doctor = await loginAs(ctx, DOCTOR1);
      const selfId = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);
      const otherId = await userIdByEmail(ctx, root, DOCTOR2_EMAIL);

      expectError(await call(ctx, 'patch', `/api/users/${selfId}`, doctor, { phone: '+1' }), 403, 'FORBIDDEN');
      expectError(await call(ctx, 'patch', `/api/users/${otherId}`, doctor, { phone: '+1' }), 403, 'FORBIDDEN');
      expectError(await call(ctx, 'patch', '/api/users/99999', doctor, { phone: '+1' }), 403, 'FORBIDDEN');
    });

    test('AC-USERS-07: гость → 401 UNAUTHORIZED на POST и PATCH', async () => {
      expectError(await call(ctx, 'post', '/api/users', undefined, doctorPayload()), 401, 'UNAUTHORIZED');
      expectError(await call(ctx, 'post', '/api/users', undefined, {}), 401, 'UNAUTHORIZED');
      expectError(await call(ctx, 'patch', '/api/users/2', undefined, { phone: '+1' }), 401, 'UNAUTHORIZED');
      expectError(await call(ctx, 'patch', '/api/users/99999', undefined, { phone: '+1' }), 401, 'UNAUTHORIZED');
    });

    test('AC-USERS-07: отказ врачу и гостю ничего не меняет', async () => {
      const doctor = await loginAs(ctx, DOCTOR1);
      await call(ctx, 'post', '/api/users', doctor, doctorPayload());
      await call(ctx, 'post', '/api/users', undefined, doctorPayload());

      const root = await loginAs(ctx, ROOT);
      const emails = (await listUsers(ctx, root)).map((c) => c.email);
      expect(emails).not.toContain('new.doctor@clinic.local');
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-08: PATCH меняет поля, пароль', () => {
    test('AC-USERS-08: admin меняет любые поля врача → 200 UserDetails, GET показывает новые значения', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);
      const patch = {
        surname: 'Иванов-Петров',
        name: 'Пётр',
        phone: '+30 210 000 0099',
        email: 'Ivanov.New@clinic.local',
        specialization: 'Хирург',
        room: 301,
        workDays: [6, 2],
        workStart: '08:30',
        workEnd: '18:00',
      };
      const expected = {
        id,
        role: 'doctor',
        surname: 'Иванов-Петров',
        name: 'Пётр',
        phone: '+30 210 000 0099',
        email: 'ivanov.new@clinic.local',
        specialization: 'Хирург',
        room: 301,
        workDays: [2, 6],
        workStart: '08:30',
        workEnd: '18:00',
        login: 'doctor1',
        isActive: true,
      };

      const res = await call(ctx, 'patch', `/api/users/${id}`, admin, patch);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(expected);
      expectNoSecrets(res.body);

      const details = await call(ctx, 'get', `/api/users/${id}`, admin);
      expect(details.status).toBe(200);
      expect(details.body).toMatchObject(expected);
    });

    test('AC-USERS-08: отсутствующие поля не меняются', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      const res = await call(ctx, 'patch', `/api/users/${id}`, admin, { phone: '+30 210 000 0099' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        surname: 'Иванов',
        name: 'Иван',
        phone: '+30 210 000 0099',
        email: DOCTOR1_EMAIL,
        specialization: 'Терапевт',
        room: 101,
        workDays: [1, 2, 3, 4, 5],
        workStart: '09:00',
        workEnd: '17:00',
        login: 'doctor1',
      });
    });

    test('AC-USERS-08: пустой пароль оставляет старый — старым паролем можно войти', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      const res = await call(ctx, 'patch', `/api/users/${id}`, admin, { phone: '+30 210 000 0099', password: '' });
      expect(res.status).toBe(200);
      expectNoSecrets(res.body);

      const login = await tryLogin(ctx, DOCTOR1);
      expect(login.status).toBe(200);
    });

    test('AC-USERS-08: новый пароль работает для входа, старый — нет', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      const res = await call(ctx, 'patch', `/api/users/${id}`, admin, { password: 'newSecret99' });
      expect(res.status).toBe(200);
      expectNoSecrets(res.body);

      const withNew = await tryLogin(ctx, { login: 'doctor1', password: 'newSecret99' });
      expect(withNew.status).toBe(200);
      expect(withNew.body.user).toMatchObject({ id, role: 'doctor' });

      const withOld = await tryLogin(ctx, DOCTOR1);
      expectError(withOld, 401, 'INVALID_CREDENTIALS');
    });

    test('AC-USERS-08: смена логина с пустым паролем сохраняет пароль', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      const res = await call(ctx, 'patch', `/api/users/${id}`, admin, { login: 'ivanov', password: '' });
      expect(res.status).toBe(200);
      expect(res.body.login).toBe('ivanov');

      expect((await tryLogin(ctx, { login: 'ivanov', password: 'doctor1234' })).status).toBe(200);
      expectError(await tryLogin(ctx, DOCTOR1), 401, 'INVALID_CREDENTIALS');
    });

    test('AC-USERS-08: невалидные значения в PATCH → 400 с полями; role игнорируется', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { password: 'short' }), 400, 'VALIDATION_ERROR', [
        'password',
      ]);
      expectError(
        await call(ctx, 'patch', `/api/users/${id}`, admin, { surname: '  ', name: null, email: 'bad' }),
        400,
        'VALIDATION_ERROR',
        ['surname', 'name', 'email'],
      );

      const roleIgnored = await call(ctx, 'patch', `/api/users/${id}`, admin, { role: 'admin' });
      expect(roleIgnored.status).toBe(200);
      expect(roleIgnored.body.role).toBe('doctor');
    });

    test('AC-USERS-08: PATCH несуществующего или некорректного id → 404 NOT_FOUND', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const id of ['99999', '0', 'abc']) {
        expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { phone: '+1' }), 404, 'NOT_FOUND');
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-09: деактивация и восстановление', () => {
    test('AC-USERS-09: isActive=false — вход 401, запись к врачу 400 SLOT_UNAVAILABLE; isActive=true — доступ возвращается', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      const off = await call(ctx, 'patch', `/api/users/${id}`, admin, { isActive: false });
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({ id, isActive: false });

      expectError(await tryLogin(ctx, DOCTOR1), 401, 'INVALID_CREDENTIALS');
      expectError(await call(ctx, 'post', '/api/appointments', admin, appointmentPayload(id)), 400, 'SLOT_UNAVAILABLE');

      const on = await call(ctx, 'patch', `/api/users/${id}`, admin, { isActive: true });
      expect(on.status).toBe(200);
      expect(on.body).toMatchObject({ id, isActive: true });

      const login = await tryLogin(ctx, DOCTOR1);
      expect(login.status).toBe(200);
      expect(login.body.user).toMatchObject({ id, role: 'doctor' });

      const booked = await call(ctx, 'post', '/api/appointments', admin, appointmentPayload(id));
      expect(booked.status).toBe(201);
    });

    test('AC-USERS-09: деактивированный врач виден admin в GET /users/:id с isActive=false', async () => {
      const id = await deactivate(DOCTOR1_EMAIL);
      const admin = await loginAs(ctx, ADMIN);
      const res = await call(ctx, 'get', `/api/users/${id}`, admin);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, isActive: false, login: 'doctor1' });
    });

    test('AC-USERS-09: root деактивирует админа — админ не может войти', async () => {
      const root = await loginAs(ctx, ROOT);
      const adminId = await userIdByEmail(ctx, root, ADMIN_EMAIL);

      const off = await call(ctx, 'patch', `/api/users/${adminId}`, root, { isActive: false });
      expect(off.status).toBe(200);
      expect(off.body.isActive).toBe(false);
      expectError(await tryLogin(ctx, ADMIN), 401, 'INVALID_CREDENTIALS');

      const on = await call(ctx, 'patch', `/api/users/${adminId}`, root, { isActive: true });
      expect(on.status).toBe(200);
      expect((await tryLogin(ctx, ADMIN)).status).toBe(200);
    });

    test('AC-USERS-09: isActive не boolean → 400 fields ⊇ [isActive]', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);
      for (const isActive of ['false', 0, null]) {
        expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { isActive }), 400, 'VALIDATION_ERROR', [
          'isActive',
        ]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-10: кто кого может менять', () => {
    test('AC-USERS-10: admin не может менять себя, другого админа и root → 403', async () => {
      const root = await loginAs(ctx, ROOT);
      const rootId = await meId(ctx, root);
      const created = await call(ctx, 'post', '/api/users', root, adminPayload());
      expect(created.status).toBe(201);
      const admin2Id = created.body.id as number;

      const admin = await loginAs(ctx, ADMIN);
      const selfId = await meId(ctx, admin);

      for (const id of [selfId, admin2Id, rootId]) {
        expectError(await call(ctx, 'patch', `/api/users/${id}`, admin, { phone: '+30 210 000 0777' }), 403, 'FORBIDDEN');
      }
    });

    test('AC-USERS-10: цель проверяется до тела — admin с невалидным телом на root → 403', async () => {
      const root = await loginAs(ctx, ROOT);
      const rootId = await meId(ctx, root);
      const admin = await loginAs(ctx, ADMIN);
      expectError(await call(ctx, 'patch', `/api/users/${rootId}`, admin, { email: 'bad' }), 403, 'FORBIDDEN');
    });

    test('AC-USERS-10: root меняет админа → 200, поля врача у админа игнорируются', async () => {
      const root = await loginAs(ctx, ROOT);
      const adminId = await userIdByEmail(ctx, root, ADMIN_EMAIL);

      const res = await call(ctx, 'patch', `/api/users/${adminId}`, root, {
        phone: '+30 210 000 0777',
        surname: 'Админова-Новая',
        room: 5,
        workDays: [1],
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: adminId,
        role: 'admin',
        phone: '+30 210 000 0777',
        surname: 'Админова-Новая',
        room: null,
        workDays: [],
        login: 'admin',
      });
      expectNoSecrets(res.body);
    });

    test('AC-USERS-10: root меняет пароль админа — новый пароль работает', async () => {
      const root = await loginAs(ctx, ROOT);
      const adminId = await userIdByEmail(ctx, root, ADMIN_EMAIL);
      const res = await call(ctx, 'patch', `/api/users/${adminId}`, root, { password: 'adminNew99' });
      expect(res.status).toBe(200);
      expect((await tryLogin(ctx, { login: 'admin', password: 'adminNew99' })).status).toBe(200);
    });

    test('AC-USERS-10: root не может менять root (себя) → 403', async () => {
      const root = await loginAs(ctx, ROOT);
      const rootId = await meId(ctx, root);
      expectError(await call(ctx, 'patch', `/api/users/${rootId}`, root, { phone: '+30 210 000 0777' }), 403, 'FORBIDDEN');
    });

    test('AC-USERS-10: admin меняет врача → 200', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR2_EMAIL);
      const res = await call(ctx, 'patch', `/api/users/${id}`, admin, { room: 202 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, room: 202 });
    });
  });

  // ---------------------------------------------------------------------------
  describe('AC-USERS-11: GET /api/users/:id', () => {
    test('AC-USERS-11: admin получает врача со всеми данными и login, без пароля', async () => {
      const root = await loginAs(ctx, ROOT);
      const admin = await loginAs(ctx, ADMIN);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);

      const res = await call(ctx, 'get', `/api/users/${id}`, admin);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          id,
          surname: 'Иванов',
          name: 'Иван',
          role: 'doctor',
          specialization: 'Терапевт',
          phone: '+30 210 000 0001',
          email: DOCTOR1_EMAIL,
          room: 101,
          workDays: [1, 2, 3, 4, 5],
          workStart: '09:00',
          workEnd: '17:00',
          isActive: true,
          login: 'doctor1',
        }),
      );
      expectNoSecrets(res.body);
    });

    test('AC-USERS-11: root получает админа и себя с login, без пароля', async () => {
      const root = await loginAs(ctx, ROOT);
      const adminId = await userIdByEmail(ctx, root, ADMIN_EMAIL);
      const rootId = await meId(ctx, root);

      const adminRes = await call(ctx, 'get', `/api/users/${adminId}`, root);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body).toMatchObject({ id: adminId, role: 'admin', email: ADMIN_EMAIL, login: 'admin' });
      expectNoSecrets(adminRes.body);

      const rootRes = await call(ctx, 'get', `/api/users/${rootId}`, root);
      expect(rootRes.status).toBe(200);
      expect(rootRes.body).toMatchObject({ id: rootId, role: 'root', email: ROOT_EMAIL, login: 'root' });
      expectNoSecrets(rootRes.body);
    });

    test('AC-USERS-11: admin запрашивает админа или root → 403 FORBIDDEN', async () => {
      const root = await loginAs(ctx, ROOT);
      const rootId = await meId(ctx, root);
      const admin = await loginAs(ctx, ADMIN);
      const adminId = await meId(ctx, admin);

      expectError(await call(ctx, 'get', `/api/users/${adminId}`, admin), 403, 'FORBIDDEN');
      expectError(await call(ctx, 'get', `/api/users/${rootId}`, admin), 403, 'FORBIDDEN');
    });

    test('AC-USERS-11: врач → 403, гость → 401', async () => {
      const root = await loginAs(ctx, ROOT);
      const id = await userIdByEmail(ctx, root, DOCTOR1_EMAIL);
      const doctor = await loginAs(ctx, DOCTOR1);

      expectError(await call(ctx, 'get', `/api/users/${id}`, doctor), 403, 'FORBIDDEN');
      expectError(await call(ctx, 'get', `/api/users/${id}`), 401, 'UNAUTHORIZED');
    });

    test('AC-USERS-11: несуществующий или некорректный id → 404 NOT_FOUND', async () => {
      const admin = await loginAs(ctx, ADMIN);
      for (const id of ['99999', '0', '-1', 'abc', '1.5']) {
        expectError(await call(ctx, 'get', `/api/users/${id}`, admin), 404, 'NOT_FOUND');
      }
    });
  });
});
