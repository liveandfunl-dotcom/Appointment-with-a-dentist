/**
 * «Сегодня» во frontend считается в часовом поясе клиники (docs/plans/clinic-timezone.md).
 * AC-TZ-02…06. Проверки не зависят от пояса машины, где идут тесты: берутся два крайних пояса,
 * у которых на одном моменте времени разные даты.
 */
import { screen, waitFor } from '@testing-library/react';

import { DatePicker } from '../../frontend/src/components/DatePicker/DatePicker';
import { todayIso } from '../../frontend/src/utils/date';
import { fail, ok } from './support/api-mock';
import { freezeTime, renderApp, renderWithI18n } from './support/render';
import { IVANOV, PETROVA } from './support/fixtures';

/** 12:00 UTC четверга 26.11.2026: в Kiritimati (UTC+14) уже пятница 27.11, в Pago_Pago (UTC−11) ещё четверг 26.11. */
const INSTANT = new Date('2026-11-26T12:00:00Z');
const AHEAD = { timezone: 'Pacific/Kiritimati', today: '2026-11-27', yesterday: '2026-11-26' };
const BEHIND = { timezone: 'Pacific/Pago_Pago', today: '2026-11-26', yesterday: '2026-11-25' };

const day = (date: string) => screen.getByRole('button', { name: date });

describe('AC-TZ-02: todayIso(timeZone, now)', () => {
  const now = new Date('2026-11-26T23:30:00Z');

  test.each([
    ['Europe/Athens', '2026-11-27'],
    ['America/New_York', '2026-11-26'],
    ['Pacific/Kiritimati', '2026-11-27'],
    ['Pacific/Pago_Pago', '2026-11-26'],
  ])('AC-TZ-02: %s → %s', (timeZone, expected) => {
    expect(todayIso(timeZone, now)).toBe(expected);
  });

  test('AC-TZ-02: без пояса — дата в поясе браузера', () => {
    const local = new Date(2026, 10, 26, 10, 0);
    expect(todayIso(undefined, local)).toBe('2026-11-26');
  });
});

describe('AC-TZ-03: DatePicker.today', () => {
  test('AC-TZ-03: today подсвечен и задаёт начальный месяц (ноябрь)', async () => {
    freezeTime(new Date(2026, 5, 1, 10, 0));
    await renderWithI18n(<DatePicker value={null} onChange={() => undefined} today="2026-11-27" />);
    expect(screen.getByText('Ноябрь 2026')).toBeInTheDocument();
    expect(day('2026-11-27')).toHaveClass('date-picker__day--today');
    expect(day('2026-11-26')).not.toHaveClass('date-picker__day--today');
  });

  test('AC-TZ-03: today из другого месяца открывает календарь на нём (декабрь)', async () => {
    freezeTime(new Date(2026, 5, 1, 10, 0));
    await renderWithI18n(<DatePicker value={null} onChange={() => undefined} today="2026-12-01" />);
    expect(screen.getByText('Декабрь 2026')).toBeInTheDocument();
    expect(day('2026-12-01')).toHaveClass('date-picker__day--today');
  });
});

describe('AC-TZ-04: «Запись на приём» по поясу клиники', () => {
  test.each([AHEAD, BEHIND])('AC-TZ-04: $timezone — вчера по клинике отключено, сегодня доступно', async (clinic) => {
    freezeTime(INSTANT);
    const app = await renderApp('/booking', {
      me: 'admin',
      api: {
        'GET /api/clinic': ok({ timezone: clinic.timezone }),
        'GET /api/users': ok([IVANOV, PETROVA]),
        'GET /api/doctors/:id/free-windows': ok([]),
      },
    });
    await screen.findByRole('option', { name: 'Иванов Иван' });
    await app.user.selectOptions(screen.getByLabelText('Врач'), 'Иванов Иван');

    await waitFor(() => expect(day(clinic.yesterday)).toBeDisabled());
    expect(day(clinic.today)).toBeEnabled();
  });
});

describe('AC-TZ-05: «Записи» по поясу клиники', () => {
  test.each([AHEAD, BEHIND])('AC-TZ-05: $timezone — подсвечено сегодня клиники', async (clinic) => {
    freezeTime(INSTANT);
    await renderApp('/records', {
      me: 'admin',
      api: { 'GET /api/clinic': ok({ timezone: clinic.timezone }), 'GET /api/users': ok([IVANOV]) },
    });
    await screen.findByRole('option', { name: 'Иванов Иван' });

    await waitFor(() => expect(day(clinic.today)).toHaveClass('date-picker__day--today'));
    expect(day(clinic.yesterday)).not.toHaveClass('date-picker__day--today');
  });
});

describe('AC-TZ-06: GET /api/clinic недоступен', () => {
  test('AC-TZ-06: «Запись на приём» работает по поясу браузера, ошибки нет, запрос один', async () => {
    freezeTime(new Date(2026, 10, 26, 10, 0));
    const app = await renderApp('/booking', {
      me: 'admin',
      api: {
        'GET /api/clinic': fail(500, 'INTERNAL_ERROR'),
        'GET /api/users': ok([IVANOV, PETROVA]),
        'GET /api/doctors/:id/free-windows': ok([]),
      },
    });
    await screen.findByRole('option', { name: 'Иванов Иван' });
    await app.user.selectOptions(screen.getByLabelText('Врач'), 'Иванов Иван');

    expect(day('2026-11-25')).toBeDisabled();
    expect(day('2026-11-26')).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(app.api.callsTo('GET /api/clinic')).toHaveLength(1);
  });
});
