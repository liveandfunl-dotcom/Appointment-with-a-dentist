// AC-SLOTS-01…04: GET /api/doctors/:id/free-windows (docs/specs/system/api.md, 4.11).
// Часы зафиксированы: понедельник 2026-12-07 10:10 Europe/Athens (BASE_NOW).
// Сидовые графики (data-model.md, 4.2):
//   doctor1 — Пн–Пт 09:00–17:00; doctor2 — Пн, Ср, Пт 08:00–14:00;
//   doctor3 — Вт, Чт, Сб 12:00–20:00; doctor4 — Пн–Сб 10:00–18:00; doctor5 — каждый день 08:00–20:00.
import {
  D,
  TestApp,
  athens,
  bookOk,
  cancel,
  deactivate,
  freeWindows,
  startApp,
  windowsOk,
} from './support/appointments-helpers';

describe('free-windows', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startApp();
  });

  afterEach(async () => {
    await t?.close();
  });

  describe('AC-SLOTS-01: окна ≥ 60 минут в рабочее время, активные записи занимают, отменённые — нет', () => {
    test('AC-SLOTS-01: свободный рабочий день → одно окно на весь график врача', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      const d2 = await t.doctorId(2);
      expect(await windowsOk(t, cookie, d1, D.wed)).toEqual([{ start: '09:00', end: '17:00' }]);
      expect(await windowsOk(t, cookie, d2, D.wed)).toEqual([{ start: '08:00', end: '14:00' }]);
    });

    test('AC-SLOTS-01: активные записи вычитаются, отрезки короче 60 минут отбрасываются', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      // 09:00–09:30 (30 мин) и 16:30–17:00 (30 мин) — короче часа, не показываются.
      await bookOk(t, cookie, { doctorId: d1, date: D.wed, start: '09:30', end: '10:30' });
      await bookOk(t, cookie, { doctorId: d1, date: D.wed, start: '13:00', end: '16:30' });
      expect(await windowsOk(t, cookie, d1, D.wed)).toEqual([{ start: '10:30', end: '13:00' }]);
    });

    test('AC-SLOTS-01: окно ровно 60 минут остаётся, окна отсортированы по началу', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      // Создаём в обратном порядке, чтобы проверить сортировку.
      await bookOk(t, cookie, { doctorId: d1, date: D.thu, start: '12:00', end: '13:00' });
      await bookOk(t, cookie, { doctorId: d1, date: D.thu, start: '10:00', end: '11:00' });
      expect(await windowsOk(t, cookie, d1, D.thu)).toEqual([
        { start: '09:00', end: '10:00' },
        { start: '11:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ]);
    });

    test('AC-SLOTS-01: запись к другому врачу и запись на другую дату окна не занимают', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      const d4 = await t.doctorId(4);
      await bookOk(t, cookie, { doctorId: d4, date: D.wed, start: '10:00', end: '12:00' });
      await bookOk(t, cookie, { doctorId: d1, date: D.thu, start: '10:00', end: '12:00' });
      expect(await windowsOk(t, cookie, d1, D.wed)).toEqual([{ start: '09:00', end: '17:00' }]);
    });

    test('AC-SLOTS-01: после отмены записи окно снова свободно', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, cookie, { doctorId: d1, date: D.wed, start: '11:00', end: '12:30' });
      expect(await windowsOk(t, cookie, d1, D.wed)).toEqual([
        { start: '09:00', end: '11:00' },
        { start: '12:30', end: '17:00' },
      ]);

      const res = await cancel(t, cookie, appt.id);
      expect(res.status).toBe(200);
      expect(await windowsOk(t, cookie, d1, D.wed)).toEqual([{ start: '09:00', end: '17:00' }]);
    });

    test('AC-SLOTS-01: окна доступны любому вошедшему — врач смотрит окна другого врача, root — любого', async () => {
      const doctor2 = await t.login('doctor2');
      const root = await t.login('root');
      const d1 = await t.doctorId(1);
      expect(await windowsOk(t, doctor2.cookie, d1, D.wed)).toEqual([{ start: '09:00', end: '17:00' }]);
      expect(await windowsOk(t, root.cookie, d1, D.wed)).toEqual([{ start: '09:00', end: '17:00' }]);
    });

    test.each([
      ['нет date', undefined],
      ['неверный формат', '09.12.2026'],
      ['несуществующая дата', '2026-02-30'],
    ])('AC-SLOTS-01: некорректная date (%s) → 400 VALIDATION_ERROR fields ⊇ [date]', async (_name, date) => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      const res = await freeWindows(t, cookie, d1, date);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields).toEqual(expect.arrayContaining(['date']));
    });
  });

  describe('AC-SLOTS-02: нерабочий день → []', () => {
    test('AC-SLOTS-02: день недели вне workDays → []', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      const d2 = await t.doctorId(2);
      const d3 = await t.doctorId(3);
      expect(await windowsOk(t, cookie, d2, D.tue)).toEqual([]); // doctor2: Пн, Ср, Пт
      expect(await windowsOk(t, cookie, d1, D.sat)).toEqual([]); // doctor1: Пн–Пт
      expect(await windowsOk(t, cookie, d1, D.sun)).toEqual([]);
      expect(await windowsOk(t, cookie, d3, D.wed)).toEqual([]); // doctor3: Вт, Чт, Сб
    });
  });

  describe('AC-SLOTS-03: прошедшие даты → [], сегодня — со следующей 30-минутной отметки после now', () => {
    test('AC-SLOTS-03: прошедшая дата, даже рабочая, → []', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      const d5 = await t.doctorId(5);
      expect(await windowsOk(t, cookie, d1, D.pastFri)).toEqual([]);
      expect(await windowsOk(t, cookie, d5, D.yesterday)).toEqual([]); // doctor5 работает каждый день
    });

    test('AC-SLOTS-03: сегодня в 10:10 окно начинается с 10:30', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      expect(await windowsOk(t, cookie, d1, D.today)).toEqual([{ start: '10:30', end: '17:00' }]);
    });

    test.each([
      ['10:00:00', '10:30', athens(D.today, '10:00', 0)],
      ['09:59', '10:00', athens(D.today, '09:59')],
      ['10:29:59', '10:30', athens(D.today, '10:29', 59)],
      ['10:30:00', '11:00', athens(D.today, '10:30', 0)],
    ])('AC-SLOTS-03: now = %s → первое окно начинается в %s', async (_label, expectedStart, now) => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      t.setNow(now);
      expect(await windowsOk(t, cookie, d1, D.today)).toEqual([{ start: expectedStart, end: '17:00' }]);
    });

    test('AC-SLOTS-03: до начала рабочего дня окно начинается с workStart', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      t.setNow(athens(D.today, '07:10'));
      expect(await windowsOk(t, cookie, d1, D.today)).toEqual([{ start: '09:00', end: '17:00' }]);
    });

    test('AC-SLOTS-03: остаток рабочего дня короче 60 минут → []', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      t.setNow(athens(D.today, '16:10')); // ближайшая отметка 16:30, до 17:00 — 30 минут
      expect(await windowsOk(t, cookie, d1, D.today)).toEqual([]);
      t.setNow(athens(D.today, '17:30')); // рабочий день закончился
      expect(await windowsOk(t, cookie, d1, D.today)).toEqual([]);
    });

    test('AC-SLOTS-03: сегодняшние записи тоже вычитаются из окон', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      await bookOk(t, cookie, { doctorId: d1, date: D.today, start: '12:00', end: '13:00' });
      expect(await windowsOk(t, cookie, d1, D.today)).toEqual([
        { start: '10:30', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ]);
    });

    test('AC-SLOTS-03: завтрашний день не обрезается текущим временем', async () => {
      const { cookie } = await t.login('admin');
      const d1 = await t.doctorId(1);
      t.setNow(athens(D.today, '16:10'));
      expect(await windowsOk(t, cookie, d1, D.tue)).toEqual([{ start: '09:00', end: '17:00' }]);
    });
  });

  describe('AC-SLOTS-04: деактивированный врач → 404, гость → 401', () => {
    test('AC-SLOTS-04: деактивированный врач → 404 NOT_FOUND', async () => {
      const { cookie } = await t.login('admin');
      const d3 = await t.doctorId(3);
      expect(await windowsOk(t, cookie, d3, D.tue)).toEqual([{ start: '12:00', end: '20:00' }]);

      await deactivate(t, d3);
      const res = await freeWindows(t, cookie, d3, D.tue);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('AC-SLOTS-04: несуществующий id и пользователь-не-врач → 404 NOT_FOUND', async () => {
      const admin = await t.login('admin');
      const root = await t.login('root');
      for (const id of [999999, admin.user.id, root.user.id]) {
        const res = await freeWindows(t, admin.cookie, id, D.wed);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });

    test('AC-SLOTS-04: гость (без cookie) → 401 UNAUTHORIZED', async () => {
      const res = await freeWindows(t, null, 1, D.wed);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('AC-SLOTS-04: неизвестная cookie сессии → 401 UNAUTHORIZED', async () => {
      const res = await freeWindows(t, 'session=bogus-token', 1, D.wed);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });
});
