/**
 * Сообщения об ошибках сервера переводятся при рендере, а не сохраняются в state переведёнными.
 * docs/plans/code-quality.md: AC-REFAC-02, AC-REFAC-03.
 */
import { screen, waitFor } from '@testing-library/react';

import en from '../../frontend/src/i18n/en.json';
import ru from '../../frontend/src/i18n/ru.json';
import { fail, ok } from './support/api-mock';
import { freezeTime, renderApp } from './support/render';
import { IVANOV, PETROVA, appointment } from './support/fixtures';

beforeEach(() => {
  freezeTime(new Date(2026, 10, 26, 10, 0));
});

const languageSelect = () => screen.getByLabelText('Язык');

describe('AC-REFAC-02: ошибка меняет язык вместе с интерфейсом', () => {
  test('AC-REFAC-02: «Записи» — ошибка загрузки списка', async () => {
    const app = await renderApp('/records', {
      me: 'admin',
      api: { 'GET /api/users': ok([IVANOV, PETROVA]), 'GET /api/appointments': fail(500, 'INTERNAL_ERROR') },
    });
    await screen.findByRole('option', { name: 'Иванов Иван' });
    await app.user.click(screen.getByRole('button', { name: '2026-11-27' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ru.common.genericError);

    await app.user.selectOptions(languageSelect(), 'en');

    expect(screen.getByRole('alert')).toHaveTextContent(en.common.genericError);
  });

  test('AC-REFAC-02: «Форма записи» — SLOT_TAKEN', async () => {
    const app = await renderApp(
      {
        pathname: '/booking/form',
        state: { doctorId: 3, doctorName: 'Иванов Иван', date: '2026-11-27', start: '09:00', end: '10:30' },
      },
      { me: 'admin', api: { 'POST /api/appointments': fail(409, 'SLOT_TAKEN') } },
    );
    await screen.findByRole('heading', { level: 1, name: ru.bookingForm.title });
    await app.user.type(screen.getByLabelText(ru.bookingForm.patientName), 'Мария');
    await app.user.type(screen.getByLabelText(ru.bookingForm.patientPhone), '+30 690 000 0000');
    await app.user.click(screen.getByRole('button', { name: ru.bookingForm.submit }));
    await app.user.click(screen.getByRole('button', { name: ru.common.yes }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ru.bookingForm.slotTaken);

    await app.user.selectOptions(languageSelect(), 'en');

    expect(screen.getByRole('alert')).toHaveTextContent(en.bookingForm.slotTaken);
  });

  test('AC-REFAC-02: страница входа — пользователь не найден', async () => {
    const app = await renderApp('/login', {
      me: 'guest',
      api: { 'POST /api/auth/magic-link': fail(404, 'USER_NOT_FOUND') },
    });
    await screen.findByRole('heading', { level: 1, name: ru.login.title });
    await app.user.type(screen.getByLabelText(ru.login.email), 'nobody@clinic.local');
    await app.user.click(screen.getByRole('button', { name: ru.login.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ru.login.userNotFound);

    await app.user.selectOptions(languageSelect(), 'en');

    expect(screen.getByRole('alert')).toHaveTextContent(en.login.userNotFound);
  });

  test('AC-REFAC-02: форма врача — общая ошибка сохранения', async () => {
    const app = await renderApp('/doctors/new', {
      me: 'admin',
      api: { 'POST /api/users': fail(500, 'INTERNAL_ERROR') },
    });
    await screen.findByRole('heading', { level: 1, name: ru.doctorForm.titleNew });
    await app.user.type(screen.getByLabelText(ru.doctorForm.surname), 'Новиков');
    await app.user.type(screen.getByLabelText(ru.doctorForm.name), 'Олег');
    await app.user.type(screen.getByLabelText(ru.doctorForm.specialization), 'Терапевт');
    await app.user.type(screen.getByLabelText(ru.doctorForm.phone), '+30 210 000 0009');
    await app.user.type(screen.getByLabelText(ru.doctorForm.email), 'novikov@clinic.local');
    await app.user.type(screen.getByLabelText(ru.doctorForm.room), '7');
    await app.user.click(screen.getByRole('checkbox', { name: ru.weekdays['1'] }));
    await app.user.click(screen.getByRole('button', { name: ru.common.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ru.common.genericError);

    await app.user.selectOptions(languageSelect(), 'en');

    expect(screen.getByRole('alert')).toHaveTextContent(en.common.genericError);
  });
});

describe('AC-REFAC-03: смена языка не перезапрашивает данные «Записей»', () => {
  test('AC-REFAC-03: GET /api/users и GET /api/appointments вызываются по одному разу', async () => {
    const app = await renderApp('/records', {
      me: 'admin',
      api: {
        'GET /api/users': ok([IVANOV, PETROVA]),
        'GET /api/appointments': ok([appointment(12, IVANOV, { start: '09:00', end: '10:30' })]),
      },
    });
    await screen.findByRole('option', { name: 'Иванов Иван' });
    await app.user.click(screen.getByRole('button', { name: '2026-11-27' }));
    await screen.findByRole('table');

    await app.user.selectOptions(languageSelect(), 'en');
    await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('en'));

    expect(app.api.callsTo('GET /api/users')).toHaveLength(1);
    expect(app.api.callsTo('GET /api/appointments')).toHaveLength(1);
  });
});
