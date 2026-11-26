/**
 * Форма врача — DoctorFormPage (/doctors/new, /doctors/:id/edit).
 * docs/specs/ui/screens.md, раздел 5.7 и маршруты (раздел 2); api.md, 4.7–4.10. AC-UI-DOC-01…06.
 */
import { screen, waitFor, within } from '@testing-library/react';

import { fail, ok, type ApiRoutes, type MockReply } from './support/api-mock';
import { renderApp, type MeOption } from './support/render';
import {
  ADMIN_CARD,
  IVANOV,
  PETROVA,
  alertTexts,
  bodyOf,
  details,
  expectFieldError,
  optionTexts,
  type UserCard,
  type UserDetails,
} from './support/fixtures';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** 00:00, 00:30 … 24:00 — 49 отметок. */
const HALF_HOURS = Array.from({ length: 49 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  return `${h}:${i % 2 ? '30' : '00'}`;
});

type App = Awaited<ReturnType<typeof renderApp>>;

async function openNew(me: MeOption, api: ApiRoutes = {}) {
  const app = await renderApp('/doctors/new', { me, api: { 'GET /api/users': ok([IVANOV, PETROVA]), ...api } });
  await screen.findByRole('heading', { level: 1, name: 'Добавить врача' });
  return app;
}

async function openEdit(me: MeOption, user: UserDetails, api: ApiRoutes = {}) {
  const app = await renderApp(`/doctors/${user.id}/edit`, {
    me,
    api: { 'GET /api/users': ok([IVANOV, PETROVA]), 'GET /api/users/:id': ok(user), ...api },
  });
  await screen.findByRole('heading', { level: 1, name: 'Редактирование карточки' });
  await waitFor(() => expect(surname()).toHaveValue(user.surname));
  return app;
}

const surname = () => screen.getByLabelText('Фамилия');
const firstName = () => screen.getByLabelText('Имя');
const specialization = () => screen.getByLabelText('Специализация');
const phone = () => screen.getByLabelText('Телефон');
const email = () => screen.getByLabelText('Почта');
const room = () => screen.getByLabelText('Кабинет');
const loginField = () => screen.getByLabelText('Логин');
const passwordField = () => screen.getByLabelText('Пароль');
const workStart = () => screen.getByLabelText('Начало');
const workEnd = () => screen.getByLabelText('Окончание');
const saveButton = () => screen.getByRole('button', { name: 'Сохранить' });
const daysGroup = () => screen.getByRole('group', { name: 'Приёмные дни' });
const dayBox = (name: string) => within(daysGroup()).getByRole('checkbox', { name });
const roleGroup = () => screen.getByRole('group', { name: 'Роль' });
const noPost = (app: App) => expect(app.api.callsTo('POST /api/users')).toHaveLength(0);

/** Заполняет форму врача допустимыми значениями (дни Пн и Ср, 10:00–18:00). */
async function fillDoctor(app: App, options: { login?: boolean } = { login: true }) {
  await app.user.type(surname(), 'Новиков');
  await app.user.type(firstName(), 'Алексей');
  await app.user.type(specialization(), 'Ортодонт');
  await app.user.type(phone(), '+30 210 000 0777');
  await app.user.type(email(), 'novikov@clinic.local');
  await app.user.type(room(), '7');
  await app.user.click(dayBox('Пн'));
  await app.user.click(dayBox('Ср'));
  await app.user.selectOptions(workStart(), '10:00');
  await app.user.selectOptions(workEnd(), '18:00');
  if (options.login) {
    await app.user.type(loginField(), 'novikov');
    await app.user.type(passwordField(), 'secret123');
  }
}

const EXPECTED_BODY = {
  role: 'doctor',
  surname: 'Новиков',
  name: 'Алексей',
  specialization: 'Ортодонт',
  phone: '+30 210 000 0777',
  email: 'novikov@clinic.local',
  room: 7,
  workDays: [1, 3],
  workStart: '10:00',
  workEnd: '18:00',
  login: 'novikov',
  password: 'secret123',
};

describe('DoctorFormPage — состав формы (создание)', () => {
  test('AC-UI-DOC-01: все поля формы «Добавить врача» с label, типы полей по спеке', async () => {
    await openNew('admin');

    expect((surname() as HTMLInputElement).type).toBe('text');
    expect(firstName()).toBeInTheDocument();
    expect(specialization()).toBeInTheDocument();
    expect(phone()).toHaveAttribute('type', 'tel');
    expect(email()).toHaveAttribute('type', 'email');
    expect(room()).toHaveAttribute('type', 'number');
    expect(room()).toHaveAttribute('min', '1');
    expect(loginField()).toBeInTheDocument();
    expect(passwordField()).toHaveAttribute('type', 'password');
    for (const field of [surname(), firstName(), specialization(), phone(), email(), room(), loginField(), passwordField()]) {
      expect(field).toHaveValue(field === room() ? null : '');
    }
  });

  test('AC-UI-DOC-01: label стоит над полем (раньше в документе), поля идут сверху вниз в порядке спеки', async () => {
    await openNew('admin');

    const fields = [surname(), firstName(), specialization(), phone(), email(), room()];
    const tail = [loginField(), passwordField()];
    for (const field of [...fields, ...tail]) {
      const label = (field as HTMLInputElement).labels?.[0];
      expect(label).toBeDefined();
      expect(label!.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const order = [...fields, workStart(), workEnd(), ...tail];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(daysGroup().compareDocumentPosition(workStart()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(room().compareDocumentPosition(daysGroup()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('AC-UI-DOC-01: «Приёмные дни» — семь чекбоксов Пн…Вс, по умолчанию не отмечены', async () => {
    await openNew('admin');

    const boxes = within(daysGroup()).getAllByRole('checkbox');
    expect(boxes.map((b) => (b as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual(WEEKDAYS);
    for (const box of boxes) expect(box).not.toBeChecked();
  });

  test('AC-UI-DOC-01: «Приёмное время» — два списка 00:00–24:00 с шагом 30 минут, по умолчанию 09:00 и 17:00', async () => {
    await openNew('admin');

    expect(screen.getByRole('group', { name: 'Приёмное время' })).toBeInTheDocument();
    for (const select of [workStart(), workEnd()]) {
      expect(select.tagName).toBe('SELECT');
      expect((select as HTMLSelectElement).multiple).toBe(false);
      expect(optionTexts(select)).toEqual(HALF_HOURS);
    }
    expect(workStart()).toHaveDisplayValue('09:00');
    expect(workEnd()).toHaveDisplayValue('17:00');
  });

  test('AC-UI-DOC-01: кнопки «Сохранить» (submit) и «Отмена» (button); чекбокса «Деактивировать» и подсказки о пароле нет', async () => {
    await openNew('admin');

    expect(saveButton()).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveAttribute('type', 'button');
    expect(screen.queryByLabelText('Деактивировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Оставьте пустым, чтобы не менять')).not.toBeInTheDocument();
  });

  test('AC-UI-DOC-02: root видит выбор роли (Врач — по умолчанию, Администратор)', async () => {
    await openNew('root');

    const group = roleGroup();
    const doctor = within(group).getByRole('radio', { name: 'Врач' });
    const admin = within(group).getByRole('radio', { name: 'Администратор' });
    expect(doctor).toBeChecked();
    expect(admin).not.toBeChecked();
    expect(doctor).toBeEnabled();
    expect(roleGroup().compareDocumentPosition(surname()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('AC-UI-DOC-02: администратор выбора роли не видит', async () => {
    await openNew('admin');

    expect(screen.queryByRole('group', { name: 'Роль' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  test('AC-UI-DOC-02: при роли «Администратор» поля врача скрыты, остальные на месте; «Врач» возвращает их', async () => {
    const app = await openNew('root');

    await app.user.click(screen.getByRole('radio', { name: 'Администратор' }));

    expect(screen.queryByLabelText('Специализация')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Кабинет')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Приёмные дни' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Приёмное время' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Начало')).not.toBeInTheDocument();
    for (const field of [surname(), firstName(), phone(), email(), loginField(), passwordField()]) {
      expect(field).toBeInTheDocument();
    }

    await app.user.click(screen.getByRole('radio', { name: 'Врач' }));
    expect(specialization()).toBeInTheDocument();
    expect(room()).toBeInTheDocument();
    expect(daysGroup()).toBeInTheDocument();
    expect(workEnd()).toBeInTheDocument();
  });

  test('AC-UI-DOC-02: администратор создаётся без полей врача (в теле запроса их нет), пустые поля врача не мешают сохранению', async () => {
    const created = { ...details(ADMIN_CARD), id: 8, surname: 'Петров', name: 'Пётр' };
    const app = await openNew('root', { 'POST /api/users': ok(created, 201) });

    await app.user.click(screen.getByRole('radio', { name: 'Администратор' }));
    await app.user.type(surname(), 'Петров');
    await app.user.type(firstName(), 'Пётр');
    await app.user.type(phone(), '+30 210 000 0200');
    await app.user.type(email(), 'admin2@clinic.local');
    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('POST /api/users')).toHaveLength(1));
    const body = bodyOf(app.api.lastCall('POST /api/users'));
    expect(body).toMatchObject({
      role: 'admin',
      surname: 'Петров',
      name: 'Пётр',
      phone: '+30 210 000 0200',
      email: 'admin2@clinic.local',
    });
    for (const key of ['specialization', 'room', 'workDays', 'workStart', 'workEnd']) {
      expect(body).not.toHaveProperty(key);
    }
    await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
  });
});

describe('DoctorFormPage — проверка перед отправкой', () => {
  test('AC-UI-DOC-03: пустая форма врача → «Обязательное поле» под фамилией, именем, специализацией, телефоном, почтой, кабинетом и «Выберите хотя бы один день»; запроса нет', async () => {
    const app = await openNew('admin');

    await app.user.click(saveButton());

    await screen.findAllByRole('alert');
    for (const field of [surname(), firstName(), specialization(), phone(), email(), room()]) {
      expectFieldError(field, 'Обязательное поле');
    }
    expect(alertTexts().filter((t) => t === 'Обязательное поле')).toHaveLength(6);
    expect(alertTexts()).toContain('Выберите хотя бы один день');
    expect(alertTexts()).toHaveLength(7);
    expect(app.location().pathname).toBe('/doctors/new');
    noPost(app);
  });

  test('AC-UI-DOC-03: у администратора (роль) обязательны только фамилия, имя, телефон и почта', async () => {
    const app = await openNew('root');

    await app.user.click(screen.getByRole('radio', { name: 'Администратор' }));
    await app.user.click(saveButton());

    await screen.findAllByRole('alert');
    expect(alertTexts()).toEqual(['Обязательное поле', 'Обязательное поле', 'Обязательное поле', 'Обязательное поле']);
    for (const field of [surname(), firstName(), phone(), email()]) expectFieldError(field, 'Обязательное поле');
    noPost(app);
  });

  test('AC-UI-DOC-03: пробелы вместо значения считаются пустым полем', async () => {
    const app = await openNew('admin');

    await fillDoctor(app, { login: false });
    await app.user.clear(surname());
    await app.user.type(surname(), '   ');
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Обязательное поле']);
    expectFieldError(surname(), 'Обязательное поле');
    noPost(app);
  });

  test.each(['bad', 'bad@', 'bad@clinic', 'ba d@clinic.local', '@clinic.local'])(
    'AC-UI-DOC-03: некорректный email «%s» → «Некорректный email» под почтой, запроса нет',
    async (value) => {
      const app = await openNew('admin');

      await fillDoctor(app, { login: false });
      await app.user.clear(email());
      await app.user.type(email(), value);
      await app.user.click(saveButton());

      await screen.findByRole('alert');
      expect(alertTexts()).toEqual(['Некорректный email']);
      expectFieldError(email(), 'Некорректный email');
      noPost(app);
    },
  );

  test('AC-UI-DOC-03: без отмеченных дней → «Выберите хотя бы один день»', async () => {
    const app = await openNew('admin');

    await fillDoctor(app, { login: false });
    await app.user.click(dayBox('Пн'));
    await app.user.click(dayBox('Ср'));
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Выберите хотя бы один день']);
    noPost(app);
  });

  test.each<[string, string, string]>([
    ['окончание раньше начала', '17:00', '09:00'],
    ['окончание равно началу', '12:30', '12:30'],
  ])('AC-UI-DOC-03: %s → «Окончание должно быть позже начала» под списком окончания', async (_label, start, end) => {
    const app = await openNew('admin');

    await fillDoctor(app, { login: false });
    await app.user.selectOptions(workStart(), start);
    await app.user.selectOptions(workEnd(), end);
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Окончание должно быть позже начала']);
    expectFieldError(workEnd(), 'Окончание должно быть позже начала');
    noPost(app);
  });

  test.each(['', 'short12'])(
    'AC-UI-DOC-03: логин задан, пароль «%s» (короче 8 символов) → «Пароль должен быть не короче 8 символов»',
    async (password) => {
      const app = await openNew('admin');

      await fillDoctor(app, { login: false });
      await app.user.type(loginField(), 'novikov');
      if (password) await app.user.type(passwordField(), password);
      await app.user.click(saveButton());

      await screen.findByRole('alert');
      expect(alertTexts()).toEqual(['Пароль должен быть не короче 8 символов']);
      expectFieldError(passwordField(), 'Пароль должен быть не короче 8 символов');
      noPost(app);
    },
  );

  test('AC-UI-DOC-03: пароль без логина → «Пароль задаётся только вместе с логином»', async () => {
    const app = await openNew('admin');

    await fillDoctor(app, { login: false });
    await app.user.type(passwordField(), 'secret123');
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Пароль задаётся только вместе с логином']);
    noPost(app);
  });

  test('AC-UI-DOC-03: без логина и пароля форма допустима (вход только по magic link)', async () => {
    const app = await openNew('admin', { 'POST /api/users': ok(details({ ...IVANOV, id: 7 }), 201) });

    await fillDoctor(app, { login: false });
    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('POST /api/users')).toHaveLength(1));
    const body = bodyOf(app.api.lastCall('POST /api/users'));
    expect(body.login ?? '').toBe('');
    expect(body.password ?? '').toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DoctorFormPage — сохранение и отмена', () => {
  /** Список карточек, который пополняется созданным врачом. */
  function usersApi() {
    const users: UserCard[] = [IVANOV];
    const api: ApiRoutes = {
      'GET /api/users': () => ok(users),
      'POST /api/users': (call) => {
        const card = { ...(call.body as Record<string, unknown>) };
        delete card.password;
        const created = { id: 7, isActive: true, login: card.login ?? null, ...card } as unknown as UserDetails;
        users.push(created);
        return ok(created, 201);
      },
    };
    return api;
  }

  test('AC-UI-DOC-04: «Сохранить» отправляет POST /api/users с телом по api.md', async () => {
    const app = await openNew('admin', usersApi());

    await fillDoctor(app);
    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('POST /api/users')).toHaveLength(1));
    expect(app.api.lastCall('POST /api/users')?.body).toEqual(EXPECTED_BODY);
  });

  test('AC-UI-DOC-04: после сохранения — переход на «Карточки врачей», новая карточка видна', async () => {
    const app = await openNew('admin', usersApi());

    await fillDoctor(app);
    await app.user.click(saveButton());

    await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeInTheDocument();
    const card = (await screen.findByRole('heading', { level: 2, name: 'Новиков Алексей' })).closest('article');
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent('Ортодонт');
    expect(card).toHaveTextContent('Пн, Ср');
    expect(card).toHaveTextContent('10:00–18:00');
    expect(screen.getByRole('heading', { level: 2, name: 'Иванов Иван' })).toBeInTheDocument();
  });

  test('AC-UI-DOC-04: «Отмена» возвращает на «Карточки врачей» без сохранения', async () => {
    const app = await openNew('admin', usersApi());

    await app.user.type(surname(), 'Новиков');
    await app.user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(app.location().pathname).toBe('/doctors');
    expect(await screen.findByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeInTheDocument();
    noPost(app);
    expect(screen.queryByRole('heading', { level: 2, name: /Новиков/ })).not.toBeInTheDocument();
  });

  test('AC-UI-DOC-04: 400 VALIDATION_ERROR → «Некорректное значение» под каждым полем из fields, остаёмся на форме', async () => {
    const app = await openNew('admin', {
      'POST /api/users': fail(400, 'VALIDATION_ERROR', ['phone', 'room']),
    });

    await fillDoctor(app);
    await app.user.click(saveButton());

    await screen.findAllByRole('alert');
    expectFieldError(phone(), 'Некорректное значение');
    expectFieldError(room(), 'Некорректное значение');
    expect(alertTexts()).toEqual(['Некорректное значение', 'Некорректное значение']);
    expect(app.location().pathname).toBe('/doctors/new');
    expect(surname()).toHaveValue('Новиков');
  });

  test('AC-UI-DOC-04: 409 EMAIL_TAKEN → «Этот email уже используется» под почтой', async () => {
    const app = await openNew('admin', { 'POST /api/users': fail(409, 'EMAIL_TAKEN', ['email']) });

    await fillDoctor(app);
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expectFieldError(email(), 'Этот email уже используется');
    expect(app.location().pathname).toBe('/doctors/new');
  });

  test('AC-UI-DOC-04: 409 LOGIN_TAKEN → «Этот логин уже занят» под логином', async () => {
    const app = await openNew('admin', { 'POST /api/users': fail(409, 'LOGIN_TAKEN', ['login']) });

    await fillDoctor(app);
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expectFieldError(loginField(), 'Этот логин уже занят');
    expect(app.location().pathname).toBe('/doctors/new');
  });

  test.each<[string, MockReply]>([
    ['403 FORBIDDEN', fail(403, 'FORBIDDEN')],
    ['500', fail(500, 'INTERNAL_ERROR')],
  ])('AC-UI-DOC-04: ответ %s → «Произошла ошибка. Попробуйте ещё раз.»', async (_label, reply) => {
    const app = await openNew('admin', { 'POST /api/users': reply });

    await fillDoctor(app);
    await app.user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Произошла ошибка. Попробуйте ещё раз.');
    expect(app.location().pathname).toBe('/doctors/new');
  });
});

describe('DoctorFormPage — редактирование', () => {
  const IVANOV_DETAILS = details(IVANOV, 'doctor1');

  test('AC-UI-DOC-05: загружает GET /api/users/:id и заполняет форму', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS);

    expect(app.api.lastCall('GET /api/users/:id')?.path).toBe('/api/users/3');
    expect(surname()).toHaveValue('Иванов');
    expect(firstName()).toHaveValue('Иван');
    expect(specialization()).toHaveValue('Терапевт');
    expect(phone()).toHaveValue('+30 210 000 0001');
    expect(email()).toHaveValue('doctor1@clinic.local');
    expect(room()).toHaveValue(101);
    expect(loginField()).toHaveValue('doctor1');
    expect(passwordField()).toHaveValue('');
    expect(workStart()).toHaveDisplayValue('09:00');
    expect(workEnd()).toHaveDisplayValue('17:00');
    for (const [i, name] of WEEKDAYS.entries()) {
      if (i < 5) expect(dayBox(name)).toBeChecked();
      else expect(dayBox(name)).not.toBeChecked();
    }
  });

  test('AC-UI-DOC-05: форма редактирования — те же поля и кнопки, плюс чекбокс «Деактивировать» и подсказка у пароля', async () => {
    await openEdit('admin', IVANOV_DETAILS);

    expect(screen.getByLabelText('Деактивировать')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Деактивировать')).not.toBeChecked();
    expect(screen.getByText('Оставьте пустым, чтобы не менять')).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('group', { name: 'Роль' })).not.toBeInTheDocument();
  });

  test('AC-UI-DOC-05: у деактивированного врача чекбокс «Деактивировать» отмечен', async () => {
    await openEdit('admin', details({ ...IVANOV, isActive: false }, 'doctor1'));

    expect(screen.getByLabelText('Деактивировать')).toBeChecked();
  });

  test('AC-UI-DOC-05: root видит роль, при редактировании выбор роли заблокирован', async () => {
    await openEdit('root', IVANOV_DETAILS);

    const doctor = within(roleGroup()).getByRole('radio', { name: 'Врач' });
    const admin = within(roleGroup()).getByRole('radio', { name: 'Администратор' });
    expect(doctor).toBeChecked();
    expect(doctor).toBeDisabled();
    expect(admin).toBeDisabled();
    expect(admin).not.toBeChecked();
  });

  test('AC-UI-DOC-05: администратора (root его редактирует) — роль «Администратор», поля врача скрыты', async () => {
    await openEdit('root', details(ADMIN_CARD, 'admin1'));

    expect(within(roleGroup()).getByRole('radio', { name: 'Администратор' })).toBeChecked();
    expect(within(roleGroup()).getByRole('radio', { name: 'Администратор' })).toBeDisabled();
    expect(surname()).toHaveValue('Админова');
    expect(screen.queryByLabelText('Специализация')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Кабинет')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Приёмные дни' })).not.toBeInTheDocument();
  });

  test('AC-UI-DOC-05: пустой пароль не отправляется — PATCH /api/users/:id без поля password', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS, { 'PATCH /api/users/:id': ok(IVANOV_DETAILS) });

    await app.user.clear(phone());
    await app.user.type(phone(), '+30 210 000 0099');
    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(1));
    const call = app.api.lastCall('PATCH /api/users/:id');
    expect(call?.path).toBe('/api/users/3');
    const body = bodyOf(call);
    expect(body).toMatchObject({
      surname: 'Иванов',
      name: 'Иван',
      specialization: 'Терапевт',
      phone: '+30 210 000 0099',
      email: 'doctor1@clinic.local',
      room: 101,
      workDays: [1, 2, 3, 4, 5],
      workStart: '09:00',
      workEnd: '17:00',
    });
    expect(body).not.toHaveProperty('password');
    expect(body.isActive).not.toBe(false);
    expect(app.api.callsTo('POST /api/users')).toHaveLength(0);
  });

  test('AC-UI-DOC-05: после сохранения — переход на «Карточки врачей»', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS, { 'PATCH /api/users/:id': ok(IVANOV_DETAILS) });

    await app.user.click(saveButton());

    await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeInTheDocument();
  });

  test('AC-UI-DOC-05: введённый пароль отправляется; ошибка длины — «Пароль должен быть не короче 8 символов»', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS, { 'PATCH /api/users/:id': ok(IVANOV_DETAILS) });

    await app.user.type(passwordField(), 'short12');
    await app.user.click(saveButton());
    await screen.findByRole('alert');
    expectFieldError(passwordField(), 'Пароль должен быть не короче 8 символов');
    expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(0);

    await app.user.clear(passwordField());
    await app.user.type(passwordField(), 'newsecret1');
    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(1));
    expect(bodyOf(app.api.lastCall('PATCH /api/users/:id'))).toMatchObject({ password: 'newsecret1' });
  });

  test('AC-UI-DOC-05: чекбокс «Деактивировать» отправляет isActive: false', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS, { 'PATCH /api/users/:id': ok({ ...IVANOV_DETAILS, isActive: false }) });

    await app.user.click(screen.getByLabelText('Деактивировать'));
    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(1));
    expect(bodyOf(app.api.lastCall('PATCH /api/users/:id')).isActive).toBe(false);
    await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
  });

  test('AC-UI-DOC-05: редактирование проверяет обязательные поля', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS);

    await app.user.clear(surname());
    await app.user.click(saveButton());

    await screen.findByRole('alert');
    expect(alertTexts()).toEqual(['Обязательное поле']);
    expectFieldError(surname(), 'Обязательное поле');
    expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(0);
  });

  test('AC-UI-DOC-05: «Отмена» возвращает на «Карточки врачей» без сохранения', async () => {
    const app = await openEdit('admin', IVANOV_DETAILS);

    await app.user.clear(surname());
    await app.user.type(surname(), 'Другой');
    await app.user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(app.location().pathname).toBe('/doctors');
    expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(0);
  });

  test('AC-UI-DOC-05: администратор (роль) сохраняется без полей врача', async () => {
    const app = await openEdit('root', details(ADMIN_CARD, 'admin1'), {
      'PATCH /api/users/:id': ok(details(ADMIN_CARD, 'admin1')),
    });

    await app.user.click(saveButton());

    await waitFor(() => expect(app.api.callsTo('PATCH /api/users/:id')).toHaveLength(1));
    const body = bodyOf(app.api.lastCall('PATCH /api/users/:id'));
    expect(body).toMatchObject({ surname: 'Админова', name: 'Анна' });
    for (const key of ['specialization', 'room', 'workDays', 'workStart', 'workEnd', 'password']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test('AC-UI-DOC-05: 404 → «Пользователь не найден», формы нет', async () => {
    await renderApp('/doctors/99/edit', {
      me: 'admin',
      api: { 'GET /api/users': ok([IVANOV]), 'GET /api/users/:id': fail(404, 'NOT_FOUND') },
    });

    expect(await screen.findByText('Пользователь не найден')).toBeInTheDocument();
    expect(screen.queryByLabelText('Фамилия')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });
});

describe('DoctorFormPage — доступ', () => {
  test.each<[string, MeOption, string, string]>([
    ['/doctors/new', 'doctor', '/doctors', 'Карточки врачей'],
    ['/doctors/5/edit', 'doctor', '/doctors', 'Карточки врачей'],
    ['/doctors/new', 'guest', '/login', 'Вход'],
    ['/doctors/5/edit', 'guest', '/login', 'Вход'],
  ])('AC-UI-DOC-06: %s для %s → редирект (replace) на %s', async (path, me, target, title) => {
    const app = await renderApp(path, {
      me,
      api: { 'GET /api/users': ok([IVANOV]), 'GET /api/users/:id': ok(details(IVANOV)) },
    });

    await screen.findByRole('heading', { level: 1, name: title });
    expect(app.location().pathname).toBe(target);
    expect(app.location().navigationType).toBe('REPLACE');
    expect(screen.queryByLabelText('Фамилия')).not.toBeInTheDocument();
    expect(app.api.callsTo('GET /api/users/:id')).toHaveLength(0);
    expect(app.api.callsTo('POST /api/users')).toHaveLength(0);
  });

  test.each<[MeOption]>([['admin'], ['root']])('AC-UI-DOC-06: %s открывает «Добавить врача» и редактирование', async (me) => {
    const app = await renderApp('/doctors/new', { me, api: { 'GET /api/users': ok([IVANOV]), 'GET /api/users/:id': ok(details(IVANOV, 'doctor1')) } });

    expect(await screen.findByRole('heading', { level: 1, name: 'Добавить врача' })).toBeInTheDocument();
    expect(app.location().pathname).toBe('/doctors/new');
    expect(surname()).toBeInTheDocument();

    await app.user.click(screen.getByRole('link', { name: 'Карточки врачей' }));
    await app.user.click(await screen.findByRole('link', { name: 'Редактировать' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Редактирование карточки' })).toBeInTheDocument();
    expect(app.location().pathname).toBe('/doctors/3/edit');
  });
});
