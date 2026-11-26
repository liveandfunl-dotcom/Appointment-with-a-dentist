/**
 * Форма записи — BookingFormPage (/booking/form).
 * docs/specs/ui/screens.md, раздел 5.5; api.md, 4.13. AC-UI-FORM-01…05
 * (сообщение об успехе на «Записи на приём» — в booking.spec.tsx).
 */
import { screen, waitFor, within } from '@testing-library/react';

import { deferred, fail, ok, type ApiRoutes, type MockReply } from './support/api-mock';
import { freezeTime, renderApp, type Lang, type MeOption } from './support/render';
import { IVANOV, PETROVA, alertTexts, appointment, bodyOf, expectFieldError } from './support/fixtures';

const SLOT = {
  doctorId: 3,
  doctorName: 'Иванов Иван',
  date: '2026-11-27',
  start: '09:00',
  end: '10:30',
};

const CREATED = { ...appointment(21, IVANOV, { start: '09:00', end: '10:30', comment: 'Болит зуб' }), mailSent: true };

beforeEach(() => {
  freezeTime(new Date(2026, 10, 26, 10, 0));
});

async function openForm(
  options: { me?: MeOption; lang?: Lang; state?: unknown; api?: ApiRoutes } = {},
) {
  const lang = options.lang ?? 'ru';
  const app = await renderApp(
    { pathname: '/booking/form', state: 'state' in options ? options.state : SLOT },
    {
      me: options.me ?? 'admin',
      lang,
      api: {
        'GET /api/users': ok([IVANOV, PETROVA]),
        'GET /api/doctors/:id/free-windows': ok([]),
        ...options.api,
      },
    },
  );
  await screen.findByRole('heading', { level: 1, name: { ru: 'Форма записи', en: 'Booking form', el: 'Φόρμα ραντεβού' }[lang] });
  return app;
}

const patientName = () => screen.getByLabelText('Имя пациента');
const patientPhone = () => screen.getByLabelText('Телефон');
const comment = () => screen.getByLabelText('Комментарий');
const submitButton = () => screen.getByRole('button', { name: 'Записать' });

async function fillPatient(app: Awaited<ReturnType<typeof openForm>>, withComment = true) {
  await app.user.type(patientName(), 'Мария Кузнецова');
  await app.user.type(patientPhone(), '+30 690 000 0000');
  if (withComment) await app.user.type(comment(), 'Болит зуб');
}

describe('BookingFormPage — поля формы', () => {
  test('AC-UI-FORM-01: врач, дата и время заполнены заранее и не редактируются', async () => {
    await openForm();

    const doctor = screen.getByLabelText('Врач');
    const date = screen.getByLabelText('Дата');
    const time = screen.getByLabelText('Время');
    expect(doctor).toHaveValue('Иванов Иван');
    expect(date).toHaveValue('27.11.2026');
    expect(time).toHaveValue('09:00–10:30');
    for (const field of [doctor, date, time]) {
      expect(field.tagName).toBe('INPUT');
      expect(field).toHaveAttribute('readonly');
    }
  });

  test('AC-UI-FORM-01: нередактируемые поля не меняются при вводе', async () => {
    const app = await openForm();

    await app.user.type(screen.getByLabelText('Врач'), 'zzz');
    await app.user.type(screen.getByLabelText('Дата'), '1');
    await app.user.type(screen.getByLabelText('Время'), '1');

    expect(screen.getByLabelText('Врач')).toHaveValue('Иванов Иван');
    expect(screen.getByLabelText('Дата')).toHaveValue('27.11.2026');
    expect(screen.getByLabelText('Время')).toHaveValue('09:00–10:30');
  });

  test('AC-UI-FORM-01: «Имя пациента», «Телефон» (type=tel) и «Комментарий» (textarea) пустые и редактируются', async () => {
    const app = await openForm();

    expect(patientName()).toHaveValue('');
    expect(patientName()).not.toHaveAttribute('readonly');
    expect(patientPhone()).toHaveAttribute('type', 'tel');
    expect(patientPhone()).toHaveValue('');
    expect(patientPhone()).not.toHaveAttribute('readonly');
    expect(comment().tagName).toBe('TEXTAREA');
    expect(comment()).not.toHaveAttribute('readonly');

    await app.user.type(patientName(), 'Мария Кузнецова');
    await app.user.type(patientPhone(), '+30 690 000 0000');
    await app.user.type(comment(), 'Болит зуб');
    expect(patientName()).toHaveValue('Мария Кузнецова');
    expect(patientPhone()).toHaveValue('+30 690 000 0000');
    expect(comment()).toHaveValue('Болит зуб');
  });

  test('AC-UI-FORM-01: кнопки «Записать» (submit) и «Назад» (button)', async () => {
    await openForm();

    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveAttribute('type', 'button');
    expect(screen.queryByText('Сначала выберите врача, дату и время')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-01: «Назад» возвращает на «Запись на приём» без запроса', async () => {
    const app = await openForm();

    await app.user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(app.location().pathname).toBe('/booking');
    expect(app.api.callsTo('POST /api/appointments')).toHaveLength(0);
    expect(await screen.findByRole('heading', { level: 1, name: 'Запись на приём' })).toBeInTheDocument();
  });
});

describe('BookingFormPage — проверка и подтверждение', () => {
  test('AC-UI-FORM-02: пустые обязательные поля → ошибки под каждым, попап не открывается, запроса нет', async () => {
    const app = await openForm();

    await app.user.click(submitButton());

    await waitFor(() => expect(alertTexts()).toEqual(['Обязательное поле', 'Обязательное поле']));
    expectFieldError(patientName(), 'Обязательное поле');
    expectFieldError(patientPhone(), 'Обязательное поле');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.api.callsTo('POST /api/appointments')).toHaveLength(0);
    expect(comment()).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('AC-UI-FORM-02: пробелы вместо значения считаются пустым полем', async () => {
    const app = await openForm();

    await app.user.type(patientName(), '   ');
    await app.user.type(patientPhone(), '+30 690 000 0000');
    await app.user.click(submitButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Обязательное поле']);
    expectFieldError(patientName(), 'Обязательное поле');
    expect(patientPhone()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-02: пустой телефон при заполненном имени → ошибка только под телефоном', async () => {
    const app = await openForm();

    await app.user.type(patientName(), 'Мария Кузнецова');
    await app.user.click(submitButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Обязательное поле']);
    expectFieldError(patientPhone(), 'Обязательное поле');
    expect(patientName()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-02: «Комментарий» необязателен — без него попап открывается', async () => {
    const app = await openForm();

    await fillPatient(app, false);
    await app.user.click(submitButton());

    expect(await screen.findByRole('dialog', { name: 'Подтвердить запись' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-03: заполненная форма → попап «Подтвердить запись» с «Да» и «Нет», запрос ещё не отправлен', async () => {
    const app = await openForm();

    await fillPatient(app);
    await app.user.click(submitButton());

    const dialog = await screen.findByRole('dialog', { name: 'Подтвердить запись' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Да' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Нет' })).toBeInTheDocument();
    expect(app.api.callsTo('POST /api/appointments')).toHaveLength(0);
  });

  test('AC-UI-FORM-03: «Нет» закрывает попап; запроса нет, введённые данные на месте, мы на форме', async () => {
    const app = await openForm();

    await fillPatient(app);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Нет' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.api.callsTo('POST /api/appointments')).toHaveLength(0);
    expect(app.location().pathname).toBe('/booking/form');
    expect(patientName()).toHaveValue('Мария Кузнецова');
    expect(patientPhone()).toHaveValue('+30 690 000 0000');
    expect(comment()).toHaveValue('Болит зуб');
  });

  test('AC-UI-FORM-03: «Да» отправляет POST /api/appointments с телом по api.md (в т.ч. lang=ru)', async () => {
    const app = await openForm({ api: { 'POST /api/appointments': ok(CREATED, 201) } });

    await fillPatient(app);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(app.api.callsTo('POST /api/appointments')).toHaveLength(1));
    expect(app.api.lastCall('POST /api/appointments')?.body).toEqual({
      doctorId: 3,
      date: '2026-11-27',
      start: '09:00',
      end: '10:30',
      patientName: 'Мария Кузнецова',
      patientPhone: '+30 690 000 0000',
      comment: 'Болит зуб',
      lang: 'ru',
    });
  });

  test('AC-UI-FORM-03: в теле запроса lang — текущий язык интерфейса (el)', async () => {
    const app = await openForm({ lang: 'el', api: { 'POST /api/appointments': ok(CREATED, 201) } });

    await app.user.type(screen.getByLabelText('Όνομα ασθενούς'), 'Μαρία');
    await app.user.type(screen.getByLabelText('Τηλέφωνο'), '+30 690 000 0000');
    await app.user.click(screen.getByRole('button', { name: 'Κράτηση' }));
    const dialog = await screen.findByRole('dialog', { name: 'Επιβεβαίωση ραντεβού' });
    await app.user.click(within(dialog).getByRole('button', { name: 'Ναι' }));

    await waitFor(() => expect(app.api.callsTo('POST /api/appointments')).toHaveLength(1));
    expect(bodyOf(app.api.lastCall('POST /api/appointments'))).toMatchObject({
      doctorId: 3,
      date: '2026-11-27',
      start: '09:00',
      end: '10:30',
      patientName: 'Μαρία',
      patientPhone: '+30 690 000 0000',
      lang: 'el',
    });
  });

  test('AC-UI-FORM-03: без комментария запись отправляется (комментарий пустой или не передан)', async () => {
    const app = await openForm({ api: { 'POST /api/appointments': ok({ ...CREATED, comment: null }, 201) } });

    await fillPatient(app, false);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(app.api.callsTo('POST /api/appointments')).toHaveLength(1));
    const body = bodyOf(app.api.lastCall('POST /api/appointments'));
    expect(body).toMatchObject({ patientName: 'Мария Кузнецова', patientPhone: '+30 690 000 0000' });
    expect(body.comment ?? '').toBe('');
  });

  test('AC-UI-FORM-03: 201 → переход на «Запись на приём» с сообщением об успехе (state booked=true, mailSent)', async () => {
    const app = await openForm({ api: { 'POST /api/appointments': ok(CREATED, 201) } });

    await fillPatient(app);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(app.location().pathname).toBe('/booking'));
    expect(app.location().state).toEqual({ booked: true, mailSent: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Запись на приём' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Пациент записан');
    expect(screen.queryByText('Письмо врачу не отправлено')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-03: 201 с mailSent=false → сообщение об успехе и «Письмо врачу не отправлено»', async () => {
    const app = await openForm({ api: { 'POST /api/appointments': ok({ ...CREATED, mailSent: false }, 201) } });

    await fillPatient(app);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(app.location().pathname).toBe('/booking'));
    expect(app.location().state).toEqual({ booked: true, mailSent: false });
    expect(await screen.findByText('Пациент записан')).toBeInTheDocument();
    expect(screen.getByText('Письмо врачу не отправлено')).toBeInTheDocument();
  });

  test('AC-UI-FORM-03: пока запрос в полёте, кнопки попапа заблокированы и повторного запроса нет', async () => {
    const gate = deferred<MockReply>();
    const app = await openForm({ api: { 'POST /api/appointments': () => gate.promise } });

    await fillPatient(app);
    await app.user.click(submitButton());
    const dialog = await screen.findByRole('dialog');
    await app.user.click(within(dialog).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да' })).toBeDisabled());
    await app.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да' }));
    expect(app.api.callsTo('POST /api/appointments')).toHaveLength(1);

    gate.resolve(ok(CREATED, 201));
    await waitFor(() => expect(app.location().pathname).toBe('/booking'));
  });
});

describe('BookingFormPage — ошибки сервера', () => {
  async function submitWith(reply: MockReply) {
    const app = await openForm({ api: { 'POST /api/appointments': reply } });
    await fillPatient(app);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));
    return app;
  }

  test('AC-UI-FORM-04: 409 SLOT_TAKEN → попап закрыт, ошибка «Это время уже занято…», остаёмся на форме с введёнными данными', async () => {
    const app = await submitWith(fail(409, 'SLOT_TAKEN'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Это время уже занято. Выберите другое.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.location().pathname).toBe('/booking/form');
    expect(screen.getByRole('heading', { level: 1, name: 'Форма записи' })).toBeInTheDocument();
    expect(patientName()).toHaveValue('Мария Кузнецова');
    expect(patientPhone()).toHaveValue('+30 690 000 0000');
    expect(comment()).toHaveValue('Болит зуб');
    expect(screen.getByLabelText('Время')).toHaveValue('09:00–10:30');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('AC-UI-FORM-04: после ошибки можно подтвердить ещё раз', async () => {
    const app = await openForm({
      api: { 'POST /api/appointments': [fail(409, 'SLOT_TAKEN'), ok(CREATED, 201)] },
    });

    await fillPatient(app);
    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));
    await screen.findByRole('alert');

    await app.user.click(submitButton());
    await app.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да' }));

    await waitFor(() => expect(app.location().pathname).toBe('/booking'));
    expect(app.api.callsTo('POST /api/appointments')).toHaveLength(2);
  });

  test.each<[string, MockReply, string]>([
    ['400 SLOT_UNAVAILABLE', fail(400, 'SLOT_UNAVAILABLE'), 'Это время недоступно для записи.'],
    ['500', fail(500, 'INTERNAL_ERROR'), 'Произошла ошибка. Попробуйте ещё раз.'],
    ['403', fail(403, 'FORBIDDEN'), 'Произошла ошибка. Попробуйте ещё раз.'],
  ])('AC-UI-FORM-04: ответ %s → сообщение, форма остаётся', async (_label, reply, text) => {
    const app = await submitWith(reply);

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(app.location().pathname).toBe('/booking/form');
    expect(patientName()).toHaveValue('Мария Кузнецова');
  });
});

describe('BookingFormPage — без выбранного слота', () => {
  const openWithoutSlot = (me: MeOption = 'admin') =>
    renderApp(
      { pathname: '/booking/form', state: undefined },
      { me, api: { 'GET /api/users': ok([IVANOV, PETROVA]), 'GET /api/doctors/:id/free-windows': ok([]) } },
    );

  test('AC-UI-FORM-05: открытая без слота форма перенаправляет на /booking', async () => {
    const app = await openWithoutSlot();

    expect(await screen.findByRole('heading', { level: 1, name: 'Запись на приём' })).toBeInTheDocument();
    expect(app.location().pathname).toBe('/booking');
  });

  test('AC-UI-FORM-05: редирект идёт с replace, формы и подсказки нет', async () => {
    const app = await openWithoutSlot();
    await screen.findByRole('heading', { level: 1, name: 'Запись на приём' });

    expect(app.location().navigationType).toBe('REPLACE');
    expect(screen.queryByRole('heading', { level: 1, name: 'Форма записи' })).not.toBeInTheDocument();
    expect(screen.queryByText('Сначала выберите врача, дату и время')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Имя пациента')).not.toBeInTheDocument();
  });
});
