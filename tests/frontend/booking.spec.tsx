/**
 * Страница «Запись на приём» — BookingPage (/booking).
 * docs/specs/ui/screens.md, раздел 5.4; api.md, 4.7, 4.11. AC-UI-BOOK-01…05
 * (и сообщение об успехе после записи — часть AC-UI-FORM-03).
 * «Сегодня» — четверг 26.11.2026, 10:00. Пн–пт — рабочие дни Иванова, пн/ср/пт — Петровой.
 */
import { screen } from '@testing-library/react';

import { ok, type ApiRoutes } from './support/api-mock';
import { freezeTime, renderApp, type MeOption, type RouteEntry } from './support/render';
import { ADMIN_CARD, IVANOV, PETROVA, SIDOROV, optionTexts } from './support/fixtures';

const WINDOWS = [
  { start: '09:00', end: '11:00' },
  { start: '13:30', end: '17:00' },
];

beforeEach(() => {
  freezeTime(new Date(2026, 10, 26, 10, 0));
});

async function openBooking(me: MeOption, api: ApiRoutes = {}, entry: string | RouteEntry = '/booking') {
  const users = me === 'root' ? [ADMIN_CARD, IVANOV, PETROVA, SIDOROV] : [IVANOV, PETROVA, SIDOROV];
  const app = await renderApp(entry, {
    me,
    api: {
      'GET /api/users': ok(users),
      'GET /api/doctors/:id/free-windows': ok([]),
      ...api,
    },
  });
  await screen.findByRole('heading', { level: 1, name: 'Запись на приём' });
  await screen.findByRole('option', { name: 'Иванов Иван' });
  return app;
}

const doctorSelect = () => screen.getByLabelText('Врач') as HTMLSelectElement;
const startSelect = () => screen.getByLabelText('Время начала') as HTMLSelectElement;
const durationSelect = () => screen.getByLabelText('Длительность') as HTMLSelectElement;
const submitButton = () => screen.getByRole('button', { name: 'Записать' });
const day = (date: string) => screen.getByRole('button', { name: date });
const allDays = () => screen.getAllByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ });

/** Администратор выбирает врача и дату; возвращает app. */
async function pickDoctorAndDate(app: Awaited<ReturnType<typeof openBooking>>, doctor: string, date: string) {
  await app.user.selectOptions(doctorSelect(), doctor);
  await app.user.click(day(date));
}

describe('BookingPage — врач и календарь', () => {
  test('AC-UI-BOOK-01: слева список врачей над календарём; подсказка «Выберите врача и дату» — под заголовком страницы', async () => {
    const { container } = await openBooking('admin');

    const aside = container.querySelector('.booking__aside') as HTMLElement | null;
    const layout = container.querySelector('.booking__layout') as HTMLElement | null;
    expect(aside).not.toBeNull();
    expect(layout).not.toBeNull();
    expect(aside).toContainElement(doctorSelect());
    expect(aside).toContainElement(day('2026-11-01'));
    expect(doctorSelect().compareDocumentPosition(day('2026-11-01')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const title = screen.getByRole('heading', { level: 1, name: 'Запись на приём' });
    const hint = screen.getByText('Выберите врача и дату');
    expect(layout).not.toContainElement(hint);
    expect(title.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(aside!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText('Время начала')).not.toBeInTheDocument();
  });

  test('AC-UI-BOOK-01: admin — «Выберите врача» и только активные врачи', async () => {
    await openBooking('admin');

    const select = doctorSelect();
    expect(optionTexts(select)).toEqual(['Выберите врача', 'Иванов Иван', 'Петрова Мария']);
    expect(select).toHaveValue('');
    expect(select).toBeEnabled();
  });

  test('AC-UI-BOOK-01: root — администраторы и деактивированные врачи не попадают в список', async () => {
    await openBooking('root');

    expect(optionTexts(doctorSelect())).toEqual(['Выберите врача', 'Иванов Иван', 'Петрова Мария']);
  });

  test('AC-UI-BOOK-01: врачу он сам выбран заранее, список заблокирован', async () => {
    await openBooking('doctor');

    const select = doctorSelect();
    expect(select).toHaveDisplayValue('Иванов Иван');
    expect(select).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'Выберите врача' })).not.toBeInTheDocument();
  });

  test('AC-UI-BOOK-02: пока врач не выбран, все дни календаря недоступны', async () => {
    const app = await openBooking('admin');

    for (const button of allDays()) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
    await app.user.click(day('2026-11-27'));
    expect(app.api.callsTo('GET /api/doctors/:id/free-windows')).toHaveLength(0);
  });

  test('AC-UI-BOOK-02: Иванов (пн–пт) — прошедшие дни и выходные недоступны, сегодня и будущие рабочие доступны', async () => {
    const app = await openBooking('admin');

    await app.user.selectOptions(doctorSelect(), 'Иванов Иван');

    expect(day('2026-11-02')).toBeDisabled(); // пн, но прошёл
    expect(day('2026-11-25')).toBeDisabled(); // ср, вчера
    expect(day('2026-11-26')).toBeEnabled(); // чт, сегодня
    expect(day('2026-11-27')).toBeEnabled(); // пт
    expect(day('2026-11-28')).toBeDisabled(); // сб
    expect(day('2026-11-29')).toBeDisabled(); // вс
    expect(day('2026-11-30')).toBeEnabled(); // пн
    expect(day('2026-11-28')).toHaveAttribute('aria-disabled', 'true');
    expect(day('2026-11-26')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('AC-UI-BOOK-02: Петрова (пн, ср, пт) — остальные дни недели недоступны, в том числе в следующем месяце', async () => {
    const app = await openBooking('admin');

    await app.user.selectOptions(doctorSelect(), 'Петрова Мария');

    expect(day('2026-11-26')).toBeDisabled(); // чт, сегодня, но не рабочий день
    expect(day('2026-11-27')).toBeEnabled(); // пт
    expect(day('2026-11-30')).toBeEnabled(); // пн

    await app.user.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(day('2026-12-01')).toBeDisabled(); // вт
    expect(day('2026-12-02')).toBeEnabled(); // ср
    expect(day('2026-12-03')).toBeDisabled(); // чт
    expect(day('2026-12-04')).toBeEnabled(); // пт
  });

  test('AC-UI-BOOK-02: при смене врача доступность дней пересчитывается', async () => {
    const app = await openBooking('admin');

    await app.user.selectOptions(doctorSelect(), 'Иванов Иван');
    expect(day('2026-11-26')).toBeEnabled();
    await app.user.selectOptions(doctorSelect(), 'Петрова Мария');
    expect(day('2026-11-26')).toBeDisabled();
    await app.user.selectOptions(doctorSelect(), 'Иванов Иван');
    expect(day('2026-11-26')).toBeEnabled();
  });

  test('AC-UI-BOOK-02: недоступный день не выбирается и не запрашивает окна', async () => {
    const app = await openBooking('admin');

    await app.user.selectOptions(doctorSelect(), 'Петрова Мария');
    await app.user.click(day('2026-11-26'));

    expect(day('2026-11-26')).toHaveAttribute('aria-pressed', 'false');
    expect(app.api.callsTo('GET /api/doctors/:id/free-windows')).toHaveLength(0);
    expect(screen.getByText('Выберите врача и дату')).toBeInTheDocument();
  });

  test('AC-UI-BOOK-02: у врача календарь сразу учитывает его рабочие дни', async () => {
    await openBooking('doctor');

    expect(day('2026-11-25')).toBeDisabled();
    expect(day('2026-11-26')).toBeEnabled();
    expect(day('2026-11-28')).toBeDisabled();
    expect(day('2026-11-30')).toBeEnabled();
  });
});

describe('BookingPage — свободное время', () => {
  const WINDOWS_ROUTE: ApiRoutes = { 'GET /api/doctors/:id/free-windows?date=2026-11-27': ok(WINDOWS) };

  test('AC-UI-BOOK-03: после выбора врача и даты запрашиваются окна GET /api/doctors/:id/free-windows?date=…', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');

    await screen.findByLabelText('Время начала');
    const calls = app.api.callsTo('GET /api/doctors/:id/free-windows');
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/doctors/3/free-windows');
    expect(calls[0].query.get('date')).toBe('2026-11-27');
    expect(day('2026-11-27')).toHaveAttribute('aria-pressed', 'true');
  });

  test('AC-UI-BOOK-03: врач — окна запрашиваются для него самого без выбора врача', async () => {
    const app = await openBooking('doctor', WINDOWS_ROUTE);

    await app.user.click(day('2026-11-27'));

    await screen.findByLabelText('Время начала');
    expect(app.api.lastCall('GET /api/doctors/:id/free-windows')?.path).toBe('/api/doctors/3/free-windows');
  });

  test('AC-UI-BOOK-03: заголовок «Свободное время» и список окон start–end', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');

    expect(await screen.findByRole('heading', { name: 'Свободное время' })).toBeInTheDocument();
    expect(screen.getByText('09:00–11:00')).toBeInTheDocument();
    expect(screen.getByText('13:30–17:00')).toBeInTheDocument();
    expect(screen.queryByText('Нет свободного времени')).not.toBeInTheDocument();
  });

  test('AC-UI-BOOK-03: время начала — шаг 30 минут, только отметки, с которых помещается час', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');

    // окно 09:00–11:00 → 09:00, 09:30, 10:00; окно 13:30–17:00 → 13:30 … 16:00
    expect(optionTexts(startSelect())).toEqual([
      '—',
      '09:00',
      '09:30',
      '10:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
    ]);
    expect(startSelect()).toHaveValue('');
    expect(startSelect()).toHaveDisplayValue('—');
  });

  test('AC-UI-BOOK-03: окно ровно в час даёт одну отметку, окно в полтора часа — две', async () => {
    const app = await openBooking('admin', {
      'GET /api/doctors/:id/free-windows?date=2026-11-27': ok([
        { start: '10:00', end: '11:00' },
        { start: '12:00', end: '13:30' },
      ]),
    });

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');

    expect(optionTexts(startSelect())).toEqual(['—', '10:00', '12:00', '12:30']);
  });

  test('AC-UI-BOOK-03: пока начало не выбрано, длительность заблокирована, «Записать» неактивна', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');

    expect(durationSelect()).toBeDisabled();
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute('type', 'button');
  });

  test.each<[string, string[]]>([
    ['09:00', ['1:00', '1:30', '2:00']],
    ['10:00', ['1:00']],
    ['13:30', ['1:00', '1:30', '2:00', '2:30', '3:00', '3:30']],
    ['16:00', ['1:00']],
  ])('AC-UI-BOOK-03: начало %s — длительности от 1:00 с шагом 0:30 до конца окна: %j', async (start, durations) => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');
    await app.user.selectOptions(startSelect(), start);

    expect(durationSelect()).toBeEnabled();
    expect(optionTexts(durationSelect())).toEqual(durations);
    expect(durationSelect()).toHaveDisplayValue('1:00');
  });

  test('AC-UI-BOOK-03: при смене начала длительность снова 1:00 (даже если прежняя длительность допустима и для нового начала)', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');
    await app.user.selectOptions(startSelect(), '13:30');
    await app.user.selectOptions(durationSelect(), '2:30');
    expect(durationSelect()).toHaveDisplayValue('2:30');

    await app.user.selectOptions(startSelect(), '14:00');

    expect(durationSelect()).toHaveDisplayValue('1:00');
    expect(optionTexts(durationSelect())).toEqual(['1:00', '1:30', '2:00', '2:30', '3:00']);

    // и когда прежняя длительность для нового начала недопустима
    await app.user.selectOptions(durationSelect(), '3:00');
    await app.user.selectOptions(startSelect(), '09:00');
    expect(durationSelect()).toHaveDisplayValue('1:00');
    expect(optionTexts(durationSelect())).toEqual(['1:00', '1:30', '2:00']);
  });

  test('AC-UI-BOOK-03: смена врача сбрасывает дату и время', async () => {
    const app = await openBooking('admin', {
      'GET /api/doctors/:id/free-windows': ok(WINDOWS),
    });

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');
    await app.user.selectOptions(startSelect(), '09:00');

    await app.user.selectOptions(doctorSelect(), 'Петрова Мария');

    expect(day('2026-11-27')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Выберите врача и дату')).toBeInTheDocument();
    expect(screen.queryByLabelText('Время начала')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Записать' })).not.toBeInTheDocument();
  });

  test('AC-UI-BOOK-04: когда начало выбрано, «Записать» становится активной', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');
    expect(submitButton()).toBeDisabled();

    await app.user.selectOptions(startSelect(), '09:30');
    expect(submitButton()).toBeEnabled();

    await app.user.selectOptions(startSelect(), '');
    expect(submitButton()).toBeDisabled();
  });

  test('AC-UI-BOOK-04: клик «Записать» открывает форму записи со слотом в location.state', async () => {
    const app = await openBooking('admin', WINDOWS_ROUTE);

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByLabelText('Время начала');
    await app.user.selectOptions(startSelect(), '13:30');
    await app.user.selectOptions(durationSelect(), '2:00');
    await app.user.click(submitButton());

    expect(app.location().pathname).toBe('/booking/form');
    expect(app.location().state).toEqual({
      doctorId: 3,
      doctorName: 'Иванов Иван',
      date: '2026-11-27',
      start: '13:30',
      end: '15:30',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Форма записи' })).toBeInTheDocument();
  });

  test('AC-UI-BOOK-04: длительность по умолчанию (1:00) даёт end = start + 1 час; врач записывает к себе', async () => {
    const app = await openBooking('doctor', WINDOWS_ROUTE);

    await app.user.click(day('2026-11-27'));
    await screen.findByLabelText('Время начала');
    await app.user.selectOptions(startSelect(), '09:30');
    await app.user.click(submitButton());

    expect(app.location().pathname).toBe('/booking/form');
    expect(app.location().state).toEqual({
      doctorId: 3,
      doctorName: 'Иванов Иван',
      date: '2026-11-27',
      start: '09:30',
      end: '10:30',
    });
  });

  test('AC-UI-BOOK-05: если свободных окон нет, показывается «Нет свободного времени» без полей выбора', async () => {
    const app = await openBooking('admin', {
      'GET /api/doctors/:id/free-windows?date=2026-11-27': ok([]),
    });

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');

    expect(await screen.findByText('Нет свободного времени')).toBeInTheDocument();
    expect(screen.queryByLabelText('Время начала')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Длительность')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Записать' })).not.toBeInTheDocument();
    expect(screen.queryByText('Выберите врача и дату')).not.toBeInTheDocument();
  });

  test('AC-UI-BOOK-05: после даты без окон выбор даты с окнами снова показывает поля', async () => {
    const app = await openBooking('admin', {
      'GET /api/doctors/:id/free-windows?date=2026-11-27': ok([]),
      'GET /api/doctors/:id/free-windows?date=2026-11-30': ok(WINDOWS),
    });

    await pickDoctorAndDate(app, 'Иванов Иван', '2026-11-27');
    await screen.findByText('Нет свободного времени');
    await app.user.click(day('2026-11-30'));

    expect(await screen.findByLabelText('Время начала')).toBeInTheDocument();
    expect(screen.queryByText('Нет свободного времени')).not.toBeInTheDocument();
  });
});

describe('BookingPage — сообщение после записи', () => {
  test('AC-UI-FORM-03: после успешной записи сверху «Пациент записан» (role=status)', async () => {
    await openBooking('admin', {}, { pathname: '/booking', state: { booked: true, mailSent: true } });

    expect(await screen.findByRole('status')).toHaveTextContent('Пациент записан');
    expect(screen.queryByText('Письмо врачу не отправлено')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-03: если письмо врачу не ушло (mailSent=false), добавляется «Письмо врачу не отправлено»', async () => {
    await openBooking('admin', {}, { pathname: '/booking', state: { booked: true, mailSent: false } });

    expect(await screen.findByText('Пациент записан')).toBeInTheDocument();
    expect(screen.getByText('Письмо врачу не отправлено')).toBeInTheDocument();
  });

  test('AC-UI-FORM-03: без state сообщения об успехе нет', async () => {
    await openBooking('admin');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Пациент записан')).not.toBeInTheDocument();
  });
});
