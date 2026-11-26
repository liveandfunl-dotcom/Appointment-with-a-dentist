// AC-APPT-01…11, AC-MAIL-01…02: записи на приём (docs/specs/system/api.md, 2.4, 4.12–4.14, 5, 6).
// Часы зафиксированы: понедельник 2026-12-07 10:10 Europe/Athens (BASE_NOW).
// Сидовые графики (data-model.md, 4.2):
//   doctor1 Иванов Иван, каб. 101 — Пн–Пт 09:00–17:00; doctor2 Петрова Анна, каб. 102 — Пн, Ср, Пт 08:00–14:00;
//   doctor3 — Вт, Чт, Сб 12:00–20:00; doctor4 Smith John, каб. 104 — Пн–Сб 10:00–18:00.
import {
  D,
  PATIENT,
  TestApp,
  athens,
  book,
  bookOk,
  cancel,
  deactivate,
  listAppointments,
  startApp,
  windowsOk,
} from './support/appointments-helpers';

type Appt = Record<string, unknown> & { id: number };

describe('appointments', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startApp();
  });

  afterEach(async () => {
    await t?.close();
  });

  describe('AC-APPT-01: admin и root записывают к любому активному врачу', () => {
    test('AC-APPT-01: admin → 201, полный объект Appointment, createDate = now, creatorId = admin', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const res = await book(t, admin.cookie, {
        doctorId: d1,
        date: D.wed,
        start: '09:00',
        end: '10:30',
        ...PATIENT,
        comment: 'Болит зуб',
        lang: 'ru',
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        doctorId: d1,
        date: D.wed,
        start: '09:00',
        end: '10:30',
        doctor: { id: d1, surname: 'Иванов', name: 'Иван', room: 101 },
        patientName: 'Мария Кузнецова',
        patientPhone: '+30 690 000 0000',
        comment: 'Болит зуб',
        status: 'active',
        canCancel: true,
        creatorId: admin.user.id,
        createDate: t.nowSec(),
        cancelerId: null,
        cancelDate: null,
        mailSent: true,
      });
    });

    test('AC-APPT-01: root записывает к другому врачу → 201, creatorId = root', async () => {
      const root = await t.login('root');
      const d4 = await t.doctorId(4);
      const appt = await bookOk(t, root.cookie, { doctorId: d4, date: D.thu, start: '10:00', end: '11:00' });
      expect(appt).toMatchObject({
        doctorId: d4,
        date: D.thu,
        start: '10:00',
        end: '11:00',
        doctor: { id: d4, surname: 'Smith', name: 'John', room: 104 },
        status: 'active',
        creatorId: root.user.id,
        createDate: t.nowSec(),
      });
    });

    test('AC-APPT-01: созданная запись сохранена и видна в GET /api/appointments', async () => {
      const admin = await t.login('admin');
      const d2 = await t.doctorId(2);
      const appt = await bookOk(t, admin.cookie, { doctorId: d2, date: D.wed, start: '08:00', end: '09:00' });
      const res = await listAppointments(t, admin.cookie, { date: D.wed });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([expect.objectContaining({ id: appt.id, doctorId: d2, start: '08:00', end: '09:00' })]);
    });

    test('AC-APPT-01: строки пациента обрезаются (trim)', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, admin.cookie, {
        doctorId: d1,
        date: D.wed,
        start: '09:00',
        end: '10:00',
        patientName: '  Мария Кузнецова  ',
        patientPhone: ' +30 690 000 0000 ',
      });
      expect(appt.patientName).toBe('Мария Кузнецова');
      expect(appt.patientPhone).toBe('+30 690 000 0000');
    });
  });

  describe('AC-APPT-02: врач записывает только к себе', () => {
    test('AC-APPT-02: врач к себе → 201, creatorId = врач', async () => {
      const doctor1 = await t.login('doctor1');
      const appt = await bookOk(t, doctor1.cookie, {
        doctorId: doctor1.user.id,
        date: D.wed,
        start: '14:00',
        end: '15:00',
      });
      expect(appt).toMatchObject({ doctorId: doctor1.user.id, creatorId: doctor1.user.id, status: 'active' });
    });

    test('AC-APPT-02: врач к другому врачу → 403 FORBIDDEN, запись не создаётся', async () => {
      const doctor1 = await t.login('doctor1');
      const admin = await t.login('admin');
      const d2 = await t.doctorId(2);
      const res = await book(t, doctor1.cookie, { doctorId: d2, date: D.wed, start: '09:00', end: '10:00', ...PATIENT });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');

      const list = await listAppointments(t, admin.cookie, { date: D.wed, doctorId: d2 });
      expect(list.body).toEqual([]);
    });
  });

  describe('AC-APPT-03: валидация полей, длительность ≥ 60, кратность 30', () => {
    const valid = (doctorId: number) => ({
      doctorId,
      date: D.wed,
      start: '09:00',
      end: '10:00',
      ...PATIENT,
    });

    test.each<[string, Record<string, unknown>, string]>([
      ['нет patientName', { patientName: undefined }, 'patientName'],
      ['пустой patientName', { patientName: '   ' }, 'patientName'],
      ['patientName > 200 символов', { patientName: 'а'.repeat(201) }, 'patientName'],
      ['нет patientPhone', { patientPhone: undefined }, 'patientPhone'],
      ['пустой patientPhone', { patientPhone: '' }, 'patientPhone'],
      ['patientPhone > 32 символов', { patientPhone: '1'.repeat(33) }, 'patientPhone'],
      ['comment > 1000 символов', { comment: 'x'.repeat(1001) }, 'comment'],
      ['comment не строка', { comment: 42 }, 'comment'],
      ['длительность 30 минут', { start: '09:00', end: '09:30' }, 'end'],
      ['end раньше start', { start: '10:00', end: '09:00' }, 'end'],
      ['end = start', { start: '10:00', end: '10:00' }, 'end'],
      ['start не кратен 30', { start: '09:15', end: '10:30' }, 'start'],
      ['end не кратен 30', { start: '09:00', end: '10:45' }, 'end'],
      ['start неверного формата', { start: '9:00', end: '10:00' }, 'start'],
      ['нет start', { start: undefined }, 'start'],
      ['нет end', { end: undefined }, 'end'],
      ['нет date', { date: undefined }, 'date'],
      ['несуществующая date', { date: '2026-02-30' }, 'date'],
      ['date неверного формата', { date: '09.12.2026' }, 'date'],
      ['нет doctorId', { doctorId: undefined }, 'doctorId'],
      ['doctorId = 0', { doctorId: 0 }, 'doctorId'],
      ['doctorId строкой', { doctorId: 'abc' }, 'doctorId'],
      ['doctorId дробный', { doctorId: 1.5 }, 'doctorId'],
      ['неизвестный lang', { lang: 'de' }, 'lang'],
    ])('AC-APPT-03: %s → 400 VALIDATION_ERROR', async (_name, patch, field) => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const body: Record<string, unknown> = { ...valid(d1), ...patch };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      const res = await book(t, admin.cookie, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields).toEqual(expect.arrayContaining([field]));
    });

    test('AC-APPT-03: start = "24:00" → 400 VALIDATION_ERROR', async () => {
      const admin = await t.login('admin');
      const d5 = await t.doctorId(5);
      const res = await book(t, admin.cookie, { ...valid(d5), start: '24:00', end: '24:00' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('AC-APPT-03: comment необязателен — без него и пустой сохраняются как null', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const a = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00' });
      expect(a.comment).toBeNull();
      const b = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '10:00', end: '11:00', comment: '' });
      expect(b.comment).toBeNull();
    });

    test('AC-APPT-03: длительность 60 минут и больше, кратно 30 → 201', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00' });
      const long = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '10:30', end: '12:00' });
      expect(long).toMatchObject({ start: '10:30', end: '12:00' });
    });

    test('AC-APPT-03: валидация проверяется раньше роли — врач к чужому врачу с неверным телом → 400', async () => {
      const doctor1 = await t.login('doctor1');
      const d2 = await t.doctorId(2);
      const res = await book(t, doctor1.cookie, { ...valid(d2), patientName: '' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('AC-APPT-04: SLOT_UNAVAILABLE — вне графика, в прошлом, к деактивированному врачу', () => {
    test.each<[string, string, string, string]>([
      ['нерабочий день (суббота)', D.sat, '10:00', '11:00'],
      ['нерабочий день (воскресенье)', D.sun, '10:00', '11:00'],
      ['начало раньше workStart', D.wed, '08:00', '09:00'],
      ['частично до workStart', D.wed, '08:30', '09:30'],
      ['конец позже workEnd', D.wed, '16:30', '17:30'],
      ['целиком после workEnd', D.wed, '17:00', '18:00'],
      ['прошедшая дата', D.pastFri, '10:00', '11:00'],
      ['сегодня, начало уже прошло', D.today, '09:00', '10:00'],
      ['сегодня, текущий слот (10:00 < now 10:10)', D.today, '10:00', '11:00'],
    ])('AC-APPT-04: doctor1, %s → 400 SLOT_UNAVAILABLE', async (_name, date, start, end) => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const res = await book(t, admin.cookie, { doctorId: d1, date, start, end, ...PATIENT });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SLOT_UNAVAILABLE');
    });

    test('AC-APPT-04: начало ровно в now → 400 SLOT_UNAVAILABLE (appointmentDate <= now)', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      t.setNow(athens(D.today, '10:30', 0));
      const res = await book(t, admin.cookie, { doctorId: d1, date: D.today, start: '10:30', end: '11:30', ...PATIENT });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SLOT_UNAVAILABLE');
    });

    test('AC-APPT-04: границы графика включительно и ближайший будущий слот сегодня → 201', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '17:00' });
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.today, start: '10:30', end: '11:30' });
    });

    test('AC-APPT-04: деактивированный врач → 400 SLOT_UNAVAILABLE', async () => {
      const admin = await t.login('admin');
      const d3 = await t.doctorId(3);
      await deactivate(t, d3);
      const res = await book(t, admin.cookie, { doctorId: d3, date: D.tue, start: '12:00', end: '13:00', ...PATIENT });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SLOT_UNAVAILABLE');
    });

    test('AC-APPT-04: несуществующий doctorId или пользователь-не-врач → 404 NOT_FOUND', async () => {
      const admin = await t.login('admin');
      const root = await t.login('root');
      for (const doctorId of [999999, admin.user.id, root.user.id]) {
        const res = await book(t, admin.cookie, { doctorId, date: D.wed, start: '09:00', end: '10:00', ...PATIENT });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('AC-APPT-05: пересечение с активной записью → 409 SLOT_TAKEN', () => {
    test.each<[string, string]>([
      ['09:00', '10:30'],
      ['11:00', '12:00'],
      ['10:00', '11:30'],
      ['09:00', '12:00'],
      ['10:30', '11:30'],
    ])('AC-APPT-05: занято 10:00–11:30, новая %s–%s → 409 SLOT_TAKEN', async (start, end) => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '10:00', end: '11:30' });
      const res = await book(t, admin.cookie, { doctorId: d1, date: D.thu, start, end, ...PATIENT });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });

    test('AC-APPT-05: смежные записи и то же время у другого врача → 201', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const d4 = await t.doctorId(4);
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '10:00', end: '11:30' });
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '09:00', end: '10:00' });
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '11:30', end: '12:30' });
      await bookOk(t, admin.cookie, { doctorId: d4, date: D.thu, start: '10:00', end: '11:30' });
    });

    test('AC-APPT-05: врач записывает к себе на занятое время → 409 SLOT_TAKEN', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      await bookOk(t, admin.cookie, { doctorId: doctor1.user.id, date: D.thu, start: '10:00', end: '11:00' });
      const res = await book(t, doctor1.cookie, {
        doctorId: doctor1.user.id,
        date: D.thu,
        start: '10:00',
        end: '11:00',
        ...PATIENT,
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });
  });

  describe('AC-APPT-06: GET /api/appointments для admin и root', () => {
    async function seedDay() {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const d4 = await t.doctorId(4);
      // Создаём не по порядку времени.
      const a = await bookOk(t, admin.cookie, { doctorId: d4, date: D.thu, start: '14:00', end: '15:00' });
      const b = await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '12:00', end: '13:00' });
      const c = await bookOk(t, admin.cookie, { doctorId: d4, date: D.thu, start: '10:00', end: '11:00' });
      const d = await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '10:00', end: '11:30' });
      const e = await bookOk(t, admin.cookie, { doctorId: d1, date: D.thu, start: '09:00', end: '10:00' });
      // Запись на другую дату в выдачу не попадает.
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.fri, start: '09:00', end: '10:00' });
      const cancelled = await cancel(t, admin.cookie, b.id);
      expect(cancelled.status).toBe(200);
      return { admin, d1, d4, a, b, c, d, e };
    }

    test('AC-APPT-06: без doctorId — записи всех врачей на дату, сортировка по началу, затем id', async () => {
      const { admin, e, c, d, b, a } = await seedDay();
      const res = await listAppointments(t, admin.cookie, { date: D.thu });
      expect(res.status).toBe(200);
      // 10:00 у двух врачей — порядок по id (c создана раньше d).
      expect((res.body as Appt[]).map((x) => x.id)).toEqual([e.id, c.id, d.id, b.id, a.id]);
    });

    test('AC-APPT-06: поля записи — время, ФИ врача, кабинет, пациент, статус, canCancel', async () => {
      const { admin, d1, d4, e, b, c } = await seedDay();
      const res = await listAppointments(t, admin.cookie, { date: D.thu });
      const byId = new Map((res.body as Appt[]).map((x) => [x.id, x]));
      expect(byId.get(e.id)).toMatchObject({
        doctorId: d1,
        date: D.thu,
        start: '09:00',
        end: '10:00',
        doctor: { id: d1, surname: 'Иванов', name: 'Иван', room: 101 },
        patientName: PATIENT.patientName,
        patientPhone: PATIENT.patientPhone,
        status: 'active',
        canCancel: true,
        cancelerId: null,
        cancelDate: null,
      });
      expect(byId.get(c.id)).toMatchObject({
        doctor: { id: d4, surname: 'Smith', name: 'John', room: 104 },
        status: 'active',
        canCancel: true,
      });
      // Отменённые записи тоже возвращаются.
      expect(byId.get(b.id)).toMatchObject({
        status: 'cancelled',
        canCancel: false,
        cancelerId: admin.user.id,
        cancelDate: t.nowSec(),
      });
    });

    test('AC-APPT-06: с doctorId — только записи этого врача', async () => {
      const { admin, d4, c, a } = await seedDay();
      const res = await listAppointments(t, admin.cookie, { date: D.thu, doctorId: d4 });
      expect(res.status).toBe(200);
      expect((res.body as Appt[]).map((x) => x.id)).toEqual([c.id, a.id]);
    });

    test('AC-APPT-06: root видит то же, что admin', async () => {
      const { e, c, d, b, a, d1 } = await seedDay();
      const root = await t.login('root');
      const all = await listAppointments(t, root.cookie, { date: D.thu });
      expect(all.status).toBe(200);
      expect((all.body as Appt[]).map((x) => x.id)).toEqual([e.id, c.id, d.id, b.id, a.id]);
      const one = await listAppointments(t, root.cookie, { date: D.thu, doctorId: d1 });
      expect((one.body as Appt[]).map((x) => x.id)).toEqual([e.id, d.id, b.id]);
    });

    test('AC-APPT-06: дата без записей и неизвестный doctorId → []', async () => {
      const { admin } = await seedDay();
      const empty = await listAppointments(t, admin.cookie, { date: D.tue });
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);
      const unknown = await listAppointments(t, admin.cookie, { date: D.thu, doctorId: 999999 });
      expect(unknown.status).toBe(200);
      expect(unknown.body).toEqual([]);
    });

    test('AC-APPT-06: записи деактивированного врача остаются в выдаче', async () => {
      const { admin, d4, c, a } = await seedDay();
      await deactivate(t, d4);
      const res = await listAppointments(t, admin.cookie, { date: D.thu, doctorId: d4 });
      expect((res.body as Appt[]).map((x) => x.id)).toEqual([c.id, a.id]);
    });

    test.each<[string, Record<string, string | number>, string]>([
      ['нет date', {}, 'date'],
      ['несуществующая date', { date: '2026-13-01' }, 'date'],
      ['doctorId не число', { date: D.thu, doctorId: 'abc' }, 'doctorId'],
      ['doctorId = 0', { date: D.thu, doctorId: 0 }, 'doctorId'],
    ])('AC-APPT-06: %s → 400 VALIDATION_ERROR', async (_name, query, field) => {
      const admin = await t.login('admin');
      const res = await listAppointments(t, admin.cookie, query);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields).toEqual(expect.arrayContaining([field]));
    });
  });

  describe('AC-APPT-07: врач получает только свои записи', () => {
    test('AC-APPT-07: врач видит только свои записи, doctorId игнорируется', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      const doctor2 = await t.login('doctor2');
      const d1 = doctor1.user.id;
      const d2 = doctor2.user.id;
      const d4 = await t.doctorId(4);
      const own2 = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '13:00', end: '14:00' });
      const own1 = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00' });
      const other2 = await bookOk(t, admin.cookie, { doctorId: d2, date: D.wed, start: '09:00', end: '10:00' });
      await bookOk(t, admin.cookie, { doctorId: d4, date: D.wed, start: '10:00', end: '11:00' });

      const plain = await listAppointments(t, doctor1.cookie, { date: D.wed });
      expect(plain.status).toBe(200);
      expect((plain.body as Appt[]).map((x) => x.id)).toEqual([own1.id, own2.id]);
      // Записи, созданные admin к этому врачу, врач может отменить.
      expect((plain.body as Appt[]).every((x) => x.canCancel === true)).toBe(true);

      const foreign = await listAppointments(t, doctor1.cookie, { date: D.wed, doctorId: d4 });
      expect(foreign.status).toBe(200);
      expect((foreign.body as Appt[]).map((x) => x.id)).toEqual([own1.id, own2.id]);

      const second = await listAppointments(t, doctor2.cookie, { date: D.wed, doctorId: d1 });
      expect((second.body as Appt[]).map((x) => x.id)).toEqual([other2.id]);
    });
  });

  describe('AC-APPT-08: admin и root отменяют любую будущую запись', () => {
    test('AC-APPT-08: admin отменяет → 200, status cancelled, cancelDate = now, cancelerId = admin', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      const appt = await bookOk(t, doctor1.cookie, {
        doctorId: doctor1.user.id,
        date: D.wed,
        start: '09:00',
        end: '10:00',
      });
      t.setNow(athens(D.today, '11:45'));
      const res = await cancel(t, admin.cookie, appt.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: appt.id,
        doctorId: doctor1.user.id,
        date: D.wed,
        start: '09:00',
        end: '10:00',
        status: 'cancelled',
        canCancel: false,
        creatorId: doctor1.user.id,
        cancelerId: admin.user.id,
        cancelDate: t.nowSec(),
      });
    });

    test('AC-APPT-08: root отменяет запись, созданную admin → 200', async () => {
      const admin = await t.login('admin');
      const root = await t.login('root');
      const d4 = await t.doctorId(4);
      const appt = await bookOk(t, admin.cookie, { doctorId: d4, date: D.tue, start: '10:00', end: '11:00' });
      const res = await cancel(t, root.cookie, appt.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'cancelled', cancelerId: root.user.id });
    });

    test('AC-APPT-08: после отмены слот свободен — окна и повторная запись на то же время', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '10:00', end: '12:00' });
      expect((await cancel(t, admin.cookie, appt.id)).status).toBe(200);
      expect(await windowsOk(t, admin.cookie, d1, D.wed)).toEqual([{ start: '09:00', end: '17:00' }]);
      const again = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '10:00', end: '12:00' });
      expect(again.id).not.toBe(appt.id);
      expect(again.status).toBe('active');
    });

    test('AC-APPT-08: несуществующая запись или некорректный id → 404 NOT_FOUND', async () => {
      const admin = await t.login('admin');
      for (const id of [999999, 0, 'abc']) {
        const res = await cancel(t, admin.cookie, id);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('AC-APPT-09: отмена прошедшей, текущей или уже отменённой записи → 400 NOT_CANCELLABLE', () => {
    test.each<[string, Date]>([
      ['начало ровно сейчас (10:30:00)', athens(D.today, '10:30', 0)],
      ['идёт приём (11:00)', athens(D.today, '11:00')],
      ['приём закончился (12:00)', athens(D.today, '12:00')],
      ['следующий день', athens(D.tue, '09:00')],
    ])('AC-APPT-09: запись сегодня 10:30–11:30, %s → 400 NOT_CANCELLABLE', async (_name, now) => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, admin.cookie, { doctorId: d1, date: D.today, start: '10:30', end: '11:30' });
      t.setNow(now);
      const res = await cancel(t, admin.cookie, appt.id);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOT_CANCELLABLE');

      const list = await listAppointments(t, admin.cookie, { date: D.today });
      expect(list.body).toEqual([expect.objectContaining({ id: appt.id, status: 'active', canCancel: false })]);
    });

    test('AC-APPT-09: за секунду до начала отмена ещё возможна → 200', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, admin.cookie, { doctorId: d1, date: D.today, start: '10:30', end: '11:30' });
      t.setNow(athens(D.today, '10:29', 59));
      const res = await cancel(t, admin.cookie, appt.id);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });

    test('AC-APPT-09: повторная отмена → 400 NOT_CANCELLABLE', async () => {
      const root = await t.login('root');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, root.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00' });
      expect((await cancel(t, root.cookie, appt.id)).status).toBe(200);
      const res = await cancel(t, root.cookie, appt.id);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOT_CANCELLABLE');
    });

    test('AC-APPT-09: врач не может отменить свою прошедшую запись → 400 NOT_CANCELLABLE', async () => {
      const doctor1 = await t.login('doctor1');
      const appt = await bookOk(t, doctor1.cookie, {
        doctorId: doctor1.user.id,
        date: D.today,
        start: '11:00',
        end: '12:00',
      });
      t.setNow(athens(D.today, '13:00'));
      const res = await cancel(t, doctor1.cookie, appt.id);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOT_CANCELLABLE');
    });
  });

  describe('AC-APPT-10: врач отменяет свою будущую запись, чужую — 403', () => {
    test('AC-APPT-10: врач отменяет свою запись (даже созданную admin) → 200, cancelerId = врач', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      const appt = await bookOk(t, admin.cookie, { doctorId: doctor1.user.id, date: D.wed, start: '09:00', end: '10:00' });
      const res = await cancel(t, doctor1.cookie, appt.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: appt.id,
        status: 'cancelled',
        canCancel: false,
        cancelerId: doctor1.user.id,
        cancelDate: t.nowSec(),
      });
    });

    test('AC-APPT-10: врач отменяет чужую запись → 403 FORBIDDEN, запись остаётся активной', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      const d2 = await t.doctorId(2);
      const appt = await bookOk(t, admin.cookie, { doctorId: d2, date: D.wed, start: '09:00', end: '10:00' });
      const res = await cancel(t, doctor1.cookie, appt.id);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');

      const list = await listAppointments(t, admin.cookie, { date: D.wed, doctorId: d2 });
      expect(list.body).toEqual([expect.objectContaining({ id: appt.id, status: 'active' })]);
    });

    test('AC-APPT-10: чужая прошедшая запись → 403 (роль проверяется раньше NOT_CANCELLABLE)', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      const d2 = await t.doctorId(2);
      const appt = await bookOk(t, admin.cookie, { doctorId: d2, date: D.today, start: '11:00', end: '12:00' });
      t.setNow(athens(D.today, '13:00'));
      const res = await cancel(t, doctor1.cookie, appt.id);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('AC-APPT-11: гость получает 401 на всех маршрутах записей', () => {
    const validBody = { doctorId: 2, date: D.wed, start: '09:00', end: '10:00', ...PATIENT };

    test.each<[string, string | null]>([
      ['без cookie', null],
      ['с неизвестной cookie', 'session=bogus-token'],
    ])('AC-APPT-11: %s — GET, POST appointments и POST cancel → 401 UNAUTHORIZED', async (_name, cookie) => {
      const list = await listAppointments(t, cookie, { date: D.wed });
      expect(list.status).toBe(401);
      expect(list.body.code).toBe('UNAUTHORIZED');

      const create = await book(t, cookie, validBody);
      expect(create.status).toBe(401);
      expect(create.body.code).toBe('UNAUTHORIZED');

      const invalid = await book(t, cookie, {});
      expect(invalid.status).toBe(401);
      expect(invalid.body.code).toBe('UNAUTHORIZED');

      const cancelRes = await cancel(t, cookie, 1);
      expect(cancelRes.status).toBe(401);
      expect(cancelRes.body.code).toBe('UNAUTHORIZED');
    });

    test('AC-APPT-11: гость не может отменить существующую запись → 401, запись активна', async () => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const appt = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00' });
      const res = await cancel(t, null, appt.id);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      const list = await listAppointments(t, admin.cookie, { date: D.wed });
      expect(list.body).toEqual([expect.objectContaining({ id: appt.id, status: 'active' })]);
    });
  });

  describe('AC-MAIL-01: письмо врачу о новой записи на ru/en/el', () => {
    // Тексты — docs/specs/system/api.md, раздел 5. Дата — DD.MM.YYYY, тире — U+2013.
    test.each<[string, Record<string, string>, string, string]>([
      [
        'ru',
        { lang: 'ru' },
        'Новая запись на приём',
        'На приём записан Мария Кузнецова, 09.12.2026 09:00–10:30. Контактный телефон: +30 690 000 0000',
      ],
      [
        'en',
        { lang: 'en' },
        'New appointment',
        'A patient has been booked: Мария Кузнецова, 09.12.2026 09:00–10:30. Contact phone: +30 690 000 0000',
      ],
      [
        'el',
        { lang: 'el' },
        'Νέο ραντεβού',
        'Νέο ραντεβού για τον/την Мария Кузнецова, 09.12.2026 09:00–10:30. Τηλέφωνο επικοινωνίας: +30 690 000 0000',
      ],
      [
        'lang не задан (по умолчанию ru)',
        {},
        'Новая запись на приём',
        'На приём записан Мария Кузнецова, 09.12.2026 09:00–10:30. Контактный телефон: +30 690 000 0000',
      ],
    ])('AC-MAIL-01: %s — письмо на email врача с текстом из шаблона', async (_name, lang, subject, text) => {
      const admin = await t.login('admin');
      const d1 = await t.doctorId(1);
      const before = t.outbox().length;
      const appt = await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:30', ...lang });
      expect(appt.mailSent).toBe(true);
      expect(t.outbox().slice(before)).toEqual([{ to: 'doctor1@clinic.local', subject, text }]);
    });

    test('AC-MAIL-01: врач записывает к себе — письмо уходит ему же', async () => {
      const doctor2 = await t.login('doctor2');
      const before = t.outbox().length;
      const appt = await bookOk(t, doctor2.cookie, {
        doctorId: doctor2.user.id,
        date: D.fri,
        start: '08:00',
        end: '09:00',
        patientName: 'Γιώργος Παπαδάκης',
        patientPhone: '+30 690 111 2222',
        lang: 'en',
      });
      expect(appt.mailSent).toBe(true);
      expect(t.outbox().slice(before)).toEqual([
        {
          to: 'doctor2@clinic.local',
          subject: 'New appointment',
          text: 'A patient has been booked: Γιώργος Παπαδάκης, 11.12.2026 08:00–09:00. Contact phone: +30 690 111 2222',
        },
      ]);
    });

    test('AC-MAIL-01: отклонённая запись (409, 400, 403) письмо не отправляет', async () => {
      const admin = await t.login('admin');
      const doctor1 = await t.login('doctor1');
      const d1 = doctor1.user.id;
      const d2 = await t.doctorId(2);
      await bookOk(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00' });
      const before = t.outbox().length;
      expect((await book(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:00', ...PATIENT })).status).toBe(409);
      expect((await book(t, admin.cookie, { doctorId: d1, date: D.sat, start: '09:00', end: '10:00', ...PATIENT })).status).toBe(400);
      expect((await book(t, doctor1.cookie, { doctorId: d2, date: D.wed, start: '09:00', end: '10:00', ...PATIENT })).status).toBe(403);
      expect(t.outbox().slice(before)).toEqual([]);
    });
  });
});

describe('AC-MAIL-02: SMTP недоступен (mail: failing)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startApp({ mail: 'failing' });
  });

  afterEach(async () => {
    await t?.close();
  });

  test('AC-MAIL-02: запись сохраняется, ответ 201 с mailSent: false', async () => {
    const admin = await t.login('admin');
    const d1 = await t.doctorId(1);
    const res = await book(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:30', ...PATIENT, lang: 'el' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      doctorId: d1,
      date: D.wed,
      start: '09:00',
      end: '10:30',
      status: 'active',
      mailSent: false,
    });
    expect(t.outbox()).toEqual([]);

    const list = await listAppointments(t, admin.cookie, { date: D.wed });
    expect(list.status).toBe(200);
    expect(list.body).toEqual([expect.objectContaining({ id: res.body.id, status: 'active' })]);

    // Слот действительно занят.
    const again = await book(t, admin.cookie, { doctorId: d1, date: D.wed, start: '09:00', end: '10:30', ...PATIENT });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SLOT_TAKEN');
  });
});
