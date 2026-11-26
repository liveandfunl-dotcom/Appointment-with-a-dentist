// AC-DB-01…04: схема, сиды, хеши паролей, миграции.
// Контракт — docs/specs/design/data-model.md (разделы 2–4), docs/specs/system/api.md (раздел 6).
import request from 'supertest';
import {
  DEV_ADMIN,
  DEV_DOCTOR_PASSWORD,
  DEV_DOCTORS,
  EXPECTED_INDEXES,
  EXPECTED_TABLES,
  FIRST_START,
  Migration,
  MigrationsModule,
  MigratorModule,
  PASS_HASH_RE,
  ROOT_SEED,
  SECOND_START,
  TempDb,
  listColumns,
  listIndexes,
  listTables,
  makeTempDb,
  readMigrations,
  readUsers,
  scryptMatches,
  startAndClose,
  startApp,
  toUnixSec,
  withDb,
} from './support/db-helpers';

// Модули ещё не реализованы — путь не литерал, чтобы файл компилировался,
// а AC-DB-04 падал во время выполнения с «Cannot find module».
const MIGRATOR_MODULE = '../../backend/src/db/migrator';
const MIGRATIONS_MODULE = '../../backend/src/db/migrations';

describe('DB: схема, сиды, миграции', () => {
  let tmp: TempDb;

  beforeEach(() => {
    tmp = makeTempDb();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  // ---------------------------------------------------------------- AC-DB-01

  test('AC-DB-01: первый старт создаёт все таблицы и индексы схемы, schema_migrations содержит version 1 initial', async () => {
    await startAndClose(tmp.dbPath);

    withDb(tmp.dbPath, (db) => {
      expect(listTables(db)).toEqual(expect.arrayContaining(EXPECTED_TABLES));
      expect(listIndexes(db)).toEqual(expect.arrayContaining(EXPECTED_INDEXES));
      expect(readMigrations(db)).toEqual([
        { version: 1, name: 'initial', appliedAt: toUnixSec(FIRST_START) },
      ]);
    });
  });

  test('AC-DB-01: первый старт создаёт ровно одного root с данными из спеки', async () => {
    await startAndClose(tmp.dbPath);

    const users = withDb(tmp.dbPath, readUsers);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      surname: ROOT_SEED.surname,
      name: ROOT_SEED.name,
      login: ROOT_SEED.login,
      email: ROOT_SEED.email,
      isRoot: 1,
      isAdmin: 0,
      isDoctor: 0,
      isActive: 1,
      phone: null,
      room: null,
      specialization: null,
      workDays: null,
      workStart: null,
      workEnd: null,
      createDate: toUnixSec(FIRST_START),
    });
  });

  test('AC-DB-01: root входит по паре root/root1234 через POST /api/auth/login', async () => {
    const app = await startApp(tmp.dbPath);
    try {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: ROOT_SEED.login, password: ROOT_SEED.password });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ surname: ROOT_SEED.surname, name: ROOT_SEED.name, role: 'root' });
    } finally {
      await app.close();
    }
  });

  test('AC-DB-01: повторный старт на том же файле не дублирует root и не применяет миграцию повторно', async () => {
    await startAndClose(tmp.dbPath, { now: FIRST_START });
    const before = withDb(tmp.dbPath, readUsers);

    await startAndClose(tmp.dbPath, { now: SECOND_START });

    withDb(tmp.dbPath, (db) => {
      const users = readUsers(db);
      expect(users).toHaveLength(1);
      expect(users.filter((u) => u.isRoot === 1)).toHaveLength(1);
      expect(users[0]).toEqual(before[0]); // тот же id, createDate и хеш пароля
      expect(readMigrations(db)).toEqual([
        { version: 1, name: 'initial', appliedAt: toUnixSec(FIRST_START) },
      ]);
    });
  });

  test('AC-DB-01: повторный старт не изменяет существующего root (сид идемпотентен по email)', async () => {
    await startAndClose(tmp.dbPath);
    withDb(tmp.dbPath, (db) => {
      db.prepare("UPDATE Users SET name = 'Changed', pass = 'scrypt$custom' WHERE email = ?").run(ROOT_SEED.email);
    });

    await startAndClose(tmp.dbPath, { now: SECOND_START });

    const users = withDb(tmp.dbPath, readUsers);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: ROOT_SEED.email, name: 'Changed', pass: 'scrypt$custom' });
  });

  // ---------------------------------------------------------------- AC-DB-02

  test('AC-DB-02: seedDev:true создаёт 5 врачей и 1 администратора с данными из спеки (всего 7 пользователей)', async () => {
    await startAndClose(tmp.dbPath, { seedDev: true });

    const users = withDb(tmp.dbPath, readUsers);
    expect(users).toHaveLength(7);
    expect(users.filter((u) => u.isRoot === 1)).toHaveLength(1);

    const doctors = users.filter((u) => u.isDoctor === 1);
    expect(doctors).toHaveLength(DEV_DOCTORS.length);
    for (const expected of DEV_DOCTORS) {
      const row = doctors.find((u) => u.email === expected.email);
      expect(row).toMatchObject({
        ...expected,
        isDoctor: 1,
        isAdmin: 0,
        isRoot: 0,
        isActive: 1,
        createDate: toUnixSec(FIRST_START),
      });
    }

    const admins = users.filter((u) => u.isAdmin === 1);
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      email: DEV_ADMIN.email,
      login: DEV_ADMIN.login,
      surname: DEV_ADMIN.surname,
      name: DEV_ADMIN.name,
      phone: DEV_ADMIN.phone,
      isAdmin: 1,
      isDoctor: 0,
      isRoot: 0,
      isActive: 1,
      room: null,
      specialization: null,
      workDays: null,
      workStart: null,
      workEnd: null,
      createDate: toUnixSec(FIRST_START),
    });
  });

  test('AC-DB-02: dev-пользователи входят своими паролями через POST /api/auth/login', async () => {
    const app = await startApp(tmp.dbPath, { seedDev: true });
    try {
      const server = app.getHttpServer();
      const admin = await request(server)
        .post('/api/auth/login')
        .send({ login: DEV_ADMIN.login, password: DEV_ADMIN.password });
      expect(admin.status).toBe(200);
      expect(admin.body.user).toMatchObject({ surname: DEV_ADMIN.surname, role: 'admin' });

      const doctor = await request(server)
        .post('/api/auth/login')
        .send({ login: DEV_DOCTORS[0].login, password: DEV_DOCTOR_PASSWORD });
      expect(doctor.status).toBe(200);
      expect(doctor.body.user).toMatchObject({ surname: DEV_DOCTORS[0].surname, role: 'doctor' });
    } finally {
      await app.close();
    }
  });

  test('AC-DB-02: повторный старт с seedDev:true ничего не дублирует и не меняет существующих пользователей', async () => {
    await startAndClose(tmp.dbPath, { seedDev: true, now: FIRST_START });
    withDb(tmp.dbPath, (db) => {
      db.prepare('UPDATE Users SET isActive = 0 WHERE email = ?').run(DEV_DOCTORS[0].email);
    });
    const before = withDb(tmp.dbPath, readUsers);

    await startAndClose(tmp.dbPath, { seedDev: true, now: SECOND_START });

    const after = withDb(tmp.dbPath, readUsers);
    expect(after).toHaveLength(7);
    expect(after).toEqual(before); // те же id, createDate, хеши; деактивированный врач остался деактивированным
  });

  test('AC-DB-02: seedDev:false создаёт только root', async () => {
    await startAndClose(tmp.dbPath, { seedDev: false });

    const users = withDb(tmp.dbPath, readUsers);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: ROOT_SEED.email, isRoot: 1 });
  });

  // ---------------------------------------------------------------- AC-DB-03

  test('AC-DB-03: pass хранится как scrypt$<saltHex>$<hashHex>, не равен паролю и проверяется пересчётом scrypt', async () => {
    await startAndClose(tmp.dbPath, { seedDev: true });

    const users = withDb(tmp.dbPath, readUsers);
    const expectedPasswords = new Map<string, string>([
      [ROOT_SEED.login, ROOT_SEED.password],
      [DEV_ADMIN.login, DEV_ADMIN.password],
      ...DEV_DOCTORS.map((d): [string, string] => [d.login, DEV_DOCTOR_PASSWORD]),
    ]);
    expect(users).toHaveLength(expectedPasswords.size);

    const salts = new Set<string>();
    for (const u of users) {
      const password = expectedPasswords.get(u.login ?? '');
      expect(password).toBeDefined();
      expect(typeof u.pass).toBe('string');
      const pass = u.pass as string;
      expect(pass).not.toBe(password);
      expect(pass).not.toContain(password);
      expect(pass).toMatch(PASS_HASH_RE);
      expect(scryptMatches(pass, password as string)).toBe(true);
      salts.add(PASS_HASH_RE.exec(pass)![1].toLowerCase());
    }
    // соль случайная для каждого пользователя, в том числе у врачей с одинаковым паролем
    expect(salts.size).toBe(users.length);
  });

  // ---------------------------------------------------------------- AC-DB-04

  test('AC-DB-04: новая миграция применяется к существующей БД без потери данных и не применяется повторно', async () => {
    const { runMigrations } = (await import(MIGRATOR_MODULE)) as MigratorModule;
    const { MIGRATIONS } = (await import(MIGRATIONS_MODULE)) as MigrationsModule;

    expect(MIGRATIONS.map(({ version, name }) => ({ version, name }))).toEqual([{ version: 1, name: 'initial' }]);

    // 1. БД первой версии с данными: старт приложения (миграция 1 + сиды) и запись на приём.
    await startAndClose(tmp.dbPath, { seedDev: true, now: FIRST_START });
    withDb(tmp.dbPath, (db) => {
      const doctor = db.prepare('SELECT id FROM Users WHERE email = ?').get(DEV_DOCTORS[0].email) as { id: number };
      const admin = db.prepare('SELECT id FROM Users WHERE email = ?').get(DEV_ADMIN.email) as { id: number };
      const start = toUnixSec(FIRST_START) + 86400;
      db.prepare(
        `INSERT INTO Appointments (doctorId, appointmentDate, endDate, createDate, creatorId, patientName, patientPhone, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(doctor.id, start, start + 3600, toUnixSec(FIRST_START), admin.id, 'Пациент Тестовый', '+30 690 000 0000', 'до миграции');
    });
    const snapshot = withDb(tmp.dbPath, (db) => ({
      users: readUsers(db),
      appointments: db.prepare('SELECT * FROM Appointments ORDER BY id').all(),
    }));
    expect(snapshot.appointments).toHaveLength(1);

    // 2. Набор миграций с дополнительной тестовой миграцией version 2.
    const testMigration: Migration = { version: 2, name: 'test', up: 'ALTER TABLE Users ADD COLUMN testNote TEXT;' };
    const migrations: Migration[] = [...MIGRATIONS, testMigration];

    withDb(tmp.dbPath, (db) => runMigrations(db, migrations, () => SECOND_START));

    withDb(tmp.dbPath, (db) => {
      expect(listColumns(db, 'Users')).toContain('testNote');
      // данные сохранились (новый столбец у старых строк — NULL)
      expect(readUsers(db)).toEqual(snapshot.users.map((u) => ({ ...u, testNote: null })));
      expect(db.prepare('SELECT * FROM Appointments ORDER BY id').all()).toEqual(snapshot.appointments);
      expect(readMigrations(db)).toEqual([
        { version: 1, name: 'initial', appliedAt: toUnixSec(FIRST_START) },
        { version: 2, name: 'test', appliedAt: toUnixSec(SECOND_START) },
      ]);
    });

    // 3. Повторный запуск: миграция 2 не применяется второй раз (иначе ALTER упал бы на дубле столбца).
    const third = new Date(SECOND_START.getTime() + 86400_000);
    withDb(tmp.dbPath, (db) => {
      expect(() => runMigrations(db, migrations, () => third)).not.toThrow();
    });

    withDb(tmp.dbPath, (db) => {
      expect(readMigrations(db)).toEqual([
        { version: 1, name: 'initial', appliedAt: toUnixSec(FIRST_START) },
        { version: 2, name: 'test', appliedAt: toUnixSec(SECOND_START) },
      ]);
      expect(readUsers(db)).toHaveLength(snapshot.users.length);
      expect(db.prepare('SELECT * FROM Appointments ORDER BY id').all()).toEqual(snapshot.appointments);
    });
  });
});
