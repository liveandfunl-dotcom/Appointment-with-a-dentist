/**
 * Страница «Записи» — RecordsPage (/records).
 * docs/specs/ui/screens.md, раздел 5.3; api.md, 4.7, 4.12, 4.14. AC-UI-REC-01…04.
 * «Сегодня» — четверг 26.11.2026.
 */
import { screen, waitFor, within } from '@testing-library/react';

import { fail, ok, type ApiRoutes } from './support/api-mock';
import { freezeTime, renderApp, type MeOption } from './support/render';
import { ADMIN_CARD, IVANOV, PETROVA, SIDOROV, appointment, optionTexts } from './support/fixtures';

const A_ACTIVE = appointment(12, IVANOV, { start: '09:00', end: '10:30', canCancel: true });
const A_CANCELLED = appointment(13, PETROVA, {
  start: '11:00',
  end: '12:00',
  patientName: 'Пётр Смирнов',
  patientPhone: '+30 690 111 1111',
  status: 'cancelled',
  canCancel: false,
  cancelerId: 2,
  cancelDate: 1795689999,
});
const A_PAST = appointment(14, IVANOV, {
  start: '14:00',
  end: '15:00',
  patientName: 'Анна Орлова',
  patientPhone: '+30 690 222 2222',
  canCancel: false,
});
const DAY_APPOINTMENTS = [A_ACTIVE, A_CANCELLED, A_PAST];

beforeEach(() => {
  freezeTime(new Date(2026, 10, 26, 10, 0));
});

async function openRecords(me: MeOption, api: ApiRoutes = {}) {
  const users = me === 'root' ? [ADMIN_CARD, IVANOV, PETROVA, SIDOROV] : [IVANOV, PETROVA];
  const app = await renderApp('/records', { me, api: { 'GET /api/users': ok(users), ...api } });
  await screen.findByRole('heading', { level: 1, name: 'Записи' });
  await screen.findByRole('option', { name: 'Иванов Иван' });
  return app;
}

const doctorSelect = () => screen.getByLabelText('Врач') as HTMLSelectElement;
const dayButton = (date: string) => screen.getByRole('button', { name: date });
const appointmentsTable = () => screen.getByRole('table');

/** Строки тела таблицы (без строки заголовков). */
function bodyRows(): HTMLElement[] {
  return within(appointmentsTable())
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0);
}

function rowOf(patient: string): HTMLElement {
  const row = bodyRows().find((r) => r.textContent?.includes(patient));
  if (!row) throw new Error(`в таблице нет строки с пациентом «${patient}»`);
  return row;
}

const cellTexts = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent?.trim());

describe('RecordsPage — раскладка и список врачей', () => {
  test('AC-UI-REC-01: два столбца — слева список врачей над календарём, справа подсказка «Выберите дату»', async () => {
    const { container } = await openRecords('admin');

    const aside = container.querySelector('.records__aside') as HTMLElement | null;
    const content = container.querySelector('.records__content') as HTMLElement | null;
    expect(aside).not.toBeNull();
    expect(content).not.toBeNull();
    expect(aside).not.toBe(content);
    expect(aside!.contains(content)).toBe(false);
    expect(content!.contains(aside)).toBe(false);

    const select = doctorSelect();
    const firstDay = dayButton('2026-11-01');
    expect(aside).toContainElement(select);
    expect(aside).toContainElement(firstDay);
    expect(content).not.toContainElement(select);
    // список врачей — над календарём
    expect(select.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(content!).getByText('Выберите дату')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('AC-UI-REC-01: для admin по умолчанию выбрано «Все», затем врачи «Фамилия Имя»', async () => {
    await openRecords('admin');

    const select = doctorSelect();
    expect(optionTexts(select)).toEqual(['Все', 'Иванов Иван', 'Петрова Мария']);
    expect(select).toHaveValue('');
    expect(select).toHaveDisplayValue('Все');
    expect(select).toBeEnabled();
  });

  test('AC-UI-REC-01: для root в списке только врачи (администраторы не попадают), в том числе деактивированные', async () => {
    await openRecords('root');

    expect(optionTexts(doctorSelect())).toEqual(['Все', 'Иванов Иван', 'Петрова Мария', 'Сидоров Пётр']);
  });

  test('AC-UI-REC-01: у врача в списке только он сам, и он выбран', async () => {
    await openRecords('doctor');

    const select = doctorSelect();
    expect(optionTexts(select)).toEqual(['Иванов Иван']);
    expect(select).toHaveDisplayValue('Иванов Иван');
    expect(screen.queryByRole('option', { name: 'Все' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Петрова Мария' })).not.toBeInTheDocument();
  });

  test('AC-UI-REC-01: пока дата не выбрана, записи не запрашиваются', async () => {
    const app = await openRecords('admin');

    expect(app.api.callsTo('GET /api/appointments')).toHaveLength(0);
  });
});

describe('RecordsPage — таблица записей за дату', () => {
  test('AC-UI-REC-02: клик по дате показывает таблицу, заголовок — выбранная дата, колонки по спеке', async () => {
    const app = await openRecords('admin', {
      'GET /api/appointments?date=2026-11-27': ok(DAY_APPOINTMENTS),
    });

    await app.user.click(dayButton('2026-11-27'));

    const table = await screen.findByRole('table', { name: '27.11.2026' });
    expect(within(table).getByRole('columnheader', { name: 'Время' })).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
      'Время',
      'Врач',
      'Кабинет',
      'Пациент',
      'Телефон',
      'Действия',
    ]);
    expect(screen.queryByText('Выберите дату')).not.toBeInTheDocument();
    expect(screen.queryByText('Записей нет')).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
  });

  test('AC-UI-REC-02: строка записи — время start–end, врач, кабинет, пациент, телефон', async () => {
    const app = await openRecords('admin', {
      'GET /api/appointments?date=2026-11-27': ok(DAY_APPOINTMENTS),
    });

    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');

    expect(cellTexts(rowOf('Мария Кузнецова')).slice(0, 5)).toEqual([
      '09:00–10:30',
      'Иванов Иван',
      '101',
      'Мария Кузнецова',
      '+30 690 000 0000',
    ]);
    expect(cellTexts(rowOf('Пётр Смирнов')).slice(0, 5)).toEqual([
      '11:00–12:00',
      'Петрова Мария',
      '102',
      'Пётр Смирнов',
      '+30 690 111 1111',
    ]);
  });

  test('AC-UI-REC-02: отменённая запись помечена («Отменена», модификатор строки), активная — нет', async () => {
    const app = await openRecords('admin', {
      'GET /api/appointments?date=2026-11-27': ok(DAY_APPOINTMENTS),
    });

    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');

    const cancelled = rowOf('Пётр Смирнов');
    expect(cancelled).toHaveClass('records-table__row--cancelled');
    expect(within(cancelled).getByText('Отменена')).toBeInTheDocument();
    expect(within(cancelled).queryByRole('button')).not.toBeInTheDocument();

    for (const patient of ['Мария Кузнецова', 'Анна Орлова']) {
      const row = rowOf(patient);
      expect(row).not.toHaveClass('records-table__row--cancelled');
      expect(within(row).queryByText('Отменена')).not.toBeInTheDocument();
    }
  });

  test('AC-UI-REC-02: запрос содержит date; для «Все» doctorId не передаётся', async () => {
    const app = await openRecords('admin', {
      'GET /api/appointments': ok(DAY_APPOINTMENTS),
    });

    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');

    const call = app.api.lastCall('GET /api/appointments');
    expect(call?.query.get('date')).toBe('2026-11-27');
    expect(call?.query.get('doctorId')).toBeNull();
  });

  test('AC-UI-REC-02: врач выбран до даты — запрос содержит date и doctorId', async () => {
    const app = await openRecords('admin', { 'GET /api/appointments': ok([A_CANCELLED]) });

    await app.user.selectOptions(doctorSelect(), 'Петрова Мария');
    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');

    const call = app.api.lastCall('GET /api/appointments');
    expect(call?.query.get('date')).toBe('2026-11-27');
    expect(call?.query.get('doctorId')).toBe('4');
  });

  test('AC-UI-REC-02: смена врача при выбранной дате заново запрашивает записи; «Все» убирает doctorId', async () => {
    const app = await openRecords('admin', { 'GET /api/appointments': ok(DAY_APPOINTMENTS) });

    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');
    const before = app.api.callsTo('GET /api/appointments').length;

    await app.user.selectOptions(doctorSelect(), 'Иванов Иван');
    await waitFor(() => expect(app.api.callsTo('GET /api/appointments').length).toBe(before + 1));
    const byDoctor = app.api.lastCall('GET /api/appointments');
    expect(byDoctor?.query.get('date')).toBe('2026-11-27');
    expect(byDoctor?.query.get('doctorId')).toBe('3');

    await app.user.selectOptions(doctorSelect(), 'Все');
    await waitFor(() => expect(app.api.callsTo('GET /api/appointments').length).toBe(before + 2));
    const all = app.api.lastCall('GET /api/appointments');
    expect(all?.query.get('date')).toBe('2026-11-27');
    expect(all?.query.get('doctorId')).toBeNull();
  });

  test('AC-UI-REC-02: календарь без ограничений — прошедшие дни тоже доступны, заголовок таблицы меняется вместе с датой', async () => {
    const app = await openRecords('admin', {
      'GET /api/appointments?date=2026-11-02': ok([A_PAST]),
      'GET /api/appointments?date=2026-11-27': ok([A_ACTIVE]),
    });

    expect(dayButton('2026-11-02')).toBeEnabled();
    expect(dayButton('2026-11-28')).toBeEnabled();

    await app.user.click(dayButton('2026-11-02'));
    await screen.findByRole('table', { name: '02.11.2026' });
    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table', { name: '27.11.2026' });
    expect(screen.queryByRole('table', { name: '02.11.2026' })).not.toBeInTheDocument();
  });

  test('AC-UI-REC-03: если записей нет, показывается «Записей нет» (таблицы нет)', async () => {
    const app = await openRecords('admin', { 'GET /api/appointments': ok([]) });

    await app.user.click(dayButton('2026-11-27'));

    expect(await screen.findByText('Записей нет')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Выберите дату')).not.toBeInTheDocument();
  });

  test('AC-UI-REC-03: переход с даты с записями на пустую дату убирает таблицу', async () => {
    const app = await openRecords('admin', {
      'GET /api/appointments?date=2026-11-27': ok(DAY_APPOINTMENTS),
      'GET /api/appointments?date=2026-11-30': ok([]),
    });

    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');
    await app.user.click(dayButton('2026-11-30'));

    expect(await screen.findByText('Записей нет')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('RecordsPage — отмена записи', () => {
  async function openDay(me: MeOption = 'admin', api: ApiRoutes = {}) {
    const app = await openRecords(me, {
      'GET /api/appointments': ok(DAY_APPOINTMENTS),
      ...api,
    });
    await app.user.click(dayButton('2026-11-27'));
    await screen.findByRole('table');
    return app;
  }

  const cancelledReply = (id: number) =>
    ok({ ...A_ACTIVE, id, status: 'cancelled', canCancel: false, cancelerId: 2, cancelDate: 1795690000 });

  test('AC-UI-REC-04: кнопка «Отменить» есть только у записи с canCancel', async () => {
    await openDay();

    expect(screen.getAllByRole('button', { name: 'Отменить' })).toHaveLength(1);
    expect(within(rowOf('Мария Кузнецова')).getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    expect(within(rowOf('Пётр Смирнов')).queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
    expect(within(rowOf('Анна Орлова')).queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
    // нет кнопки и нет отметки у активной записи, которую уже нельзя отменить
    expect(cellTexts(rowOf('Анна Орлова'))[5]).toBe('');
  });

  test('AC-UI-REC-04: клик по «Отменить» открывает попап «Отменить запись?» с «Да» и «Нет», запрос ещё не отправлен', async () => {
    const app = await openDay();

    await app.user.click(screen.getByRole('button', { name: 'Отменить' }));

    const dialog = screen.getByRole('dialog', { name: 'Отменить запись?' });
    expect(within(dialog).getByRole('button', { name: 'Да' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Нет' })).toBeInTheDocument();
    expect(app.api.callsTo('POST /api/appointments/:id/cancel')).toHaveLength(0);
  });

  test('AC-UI-REC-04: «Нет» закрывает попап, запись остаётся активной, запрос не отправляется', async () => {
    const app = await openDay();

    await app.user.click(screen.getByRole('button', { name: 'Отменить' }));
    await app.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Нет' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.api.callsTo('POST /api/appointments/:id/cancel')).toHaveLength(0);
    expect(within(rowOf('Мария Кузнецова')).getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    expect(rowOf('Мария Кузнецова')).not.toHaveClass('records-table__row--cancelled');
  });

  test('AC-UI-REC-04: «Да» отправляет POST /api/appointments/:id/cancel, запись помечается отменённой и теряет кнопку', async () => {
    const app = await openDay('admin', {
      'POST /api/appointments/:id/cancel': (call) => cancelledReply(Number(call.params.id)),
    });

    await app.user.click(screen.getByRole('button', { name: 'Отменить' }));
    await app.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(within(rowOf('Мария Кузнецова')).getByText('Отменена')).toBeInTheDocument());
    const calls = app.api.callsTo('POST /api/appointments/:id/cancel');
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/appointments/12/cancel');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const row = rowOf('Мария Кузнецова');
    expect(row).toHaveClass('records-table__row--cancelled');
    expect(within(row).queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
    // остальные строки не изменились
    expect(within(rowOf('Пётр Смирнов')).getAllByText('Отменена')).toHaveLength(1);
    expect(rowOf('Анна Орлова')).not.toHaveClass('records-table__row--cancelled');
  });

  test('AC-UI-REC-04: 400 NOT_CANCELLABLE → сообщение «Эту запись уже нельзя отменить»', async () => {
    const app = await openDay('admin', {
      'POST /api/appointments/:id/cancel': fail(400, 'NOT_CANCELLABLE'),
    });

    await app.user.click(screen.getByRole('button', { name: 'Отменить' }));
    await app.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Эту запись уже нельзя отменить');
    expect(within(rowOf('Мария Кузнецова')).queryByText('Отменена')).not.toBeInTheDocument();
  });

  test('AC-UI-REC-04: врач видит таблицу и может отменить запись', async () => {
    const app = await openDay('doctor', {
      'POST /api/appointments/:id/cancel': (call) => cancelledReply(Number(call.params.id)),
    });

    expect(screen.getAllByRole('button', { name: 'Отменить' })).toHaveLength(1);
    await app.user.click(screen.getByRole('button', { name: 'Отменить' }));
    await app.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(within(rowOf('Мария Кузнецова')).getByText('Отменена')).toBeInTheDocument());
  });
});
