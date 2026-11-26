/**
 * Вход: LoginPage (/login) и MagicLinkPage (/auth/magic?token=…).
 * docs/specs/ui/screens.md, разделы 5.1, 5.2; api.md, 4.2–4.4. AC-UI-LOGIN-01…05.
 */
import { act, screen, waitFor, within } from '@testing-library/react';

import { deferred, fail, mockApi, ok, type MockReply } from './support/api-mock';
import { ME, renderApp, setSessionUser } from './support/render';

const submitButton = () => screen.getByRole('button', { name: 'Авторизоваться' });
const emailField = () => screen.getByLabelText('Email');

async function openLogin(options: Parameters<typeof renderApp>[1] = {}) {
  const app = await renderApp('/login', { me: 'guest', ...options });
  const title = { ru: 'Вход', en: 'Sign in', el: 'Σύνδεση' }[options.lang ?? 'ru'];
  await screen.findByRole('heading', { level: 1, name: title });
  return app;
}

async function switchToPassword(app: Awaited<ReturnType<typeof renderApp>>) {
  await app.user.click(screen.getByRole('button', { name: 'Войти по логину и паролю' }));
  await screen.findByLabelText('Логин');
}

/** Текст ошибки под полем: role="alert", поле aria-invalid и aria-describedby на него. */
function expectFieldError(field: HTMLElement, text: string) {
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent(text);
  expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (field.getAttribute('aria-describedby') ?? '').split(/\s+/);
  expect(alert.id).toBeTruthy();
  expect(describedBy).toContain(alert.id);
}

describe('LoginPage — режим email', () => {
  test('AC-UI-LOGIN-01: есть поле Email (type=email) и кнопки «Авторизоваться» и «Войти по логину и паролю»', async () => {
    await openLogin();

    expect(emailField()).toHaveAttribute('type', 'email');
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Войти по логину и паролю' })).toHaveAttribute('type', 'button');
    expect(screen.queryByLabelText('Логин')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
  });

  test('AC-UI-LOGIN-01: «Авторизоваться» активна только при корректном email', async () => {
    const app = await openLogin();

    expect(submitButton()).toBeDisabled();
    for (const invalid of ['doctor', 'doctor@', 'doctor@clinic', 'doc tor@clinic.local', '@clinic.local']) {
      await app.user.clear(emailField());
      await app.user.type(emailField(), invalid);
      expect(submitButton()).toBeDisabled();
    }

    await app.user.clear(emailField());
    await app.user.type(emailField(), 'doctor1@clinic.local');
    expect(submitButton()).toBeEnabled();

    await app.user.clear(emailField());
    await app.user.type(emailField(), '  doctor1@clinic.local  ');
    expect(submitButton()).toBeEnabled();

    await app.user.clear(emailField());
    expect(submitButton()).toBeDisabled();
  });

  test('AC-UI-LOGIN-02: для неизвестного email под полем появляется текст ошибки (role=alert), ввод в поле её убирает', async () => {
    mockApi({ 'POST /api/auth/magic-link': fail(404, 'USER_NOT_FOUND') });
    const app = await openLogin();

    await app.user.type(emailField(), 'nobody@clinic.local');
    await app.user.click(submitButton());

    await screen.findByRole('alert');
    expectFieldError(emailField(), 'Пользователь с таким email не найден');
    expect(screen.queryByText('Ссылка отправлена на почту')).not.toBeInTheDocument();

    await app.user.type(emailField(), 'x');
    await waitFor(() => expect(screen.queryByText('Пользователь с таким email не найден')).not.toBeInTheDocument());
  });

  test.each<[string, MockReply, string]>([
    ['503 MAIL_FAILED', fail(503, 'MAIL_FAILED'), 'Не удалось отправить письмо. Попробуйте позже.'],
    ['429 TOO_MANY_REQUESTS', fail(429, 'TOO_MANY_REQUESTS'), 'Слишком много попыток. Попробуйте позже.'],
    ['500', fail(500, 'INTERNAL_ERROR'), 'Произошла ошибка. Попробуйте ещё раз.'],
  ])('AC-UI-LOGIN-02: ответ %s → текст ошибки', async (_label, reply, text) => {
    mockApi({ 'POST /api/auth/magic-link': reply });
    const app = await openLogin();

    await app.user.type(emailField(), 'doctor1@clinic.local');
    await app.user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  test('AC-UI-LOGIN-03: при успехе показывается «Ссылка отправлена на почту»; в запросе email и lang', async () => {
    const app = await openLogin({ api: { 'POST /api/auth/magic-link': ok({ ok: true }) } });

    await app.user.type(emailField(), 'doctor1@clinic.local');
    await app.user.click(submitButton());

    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка отправлена на почту');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const calls = app.api.callsTo('POST /api/auth/magic-link');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ email: 'doctor1@clinic.local', lang: 'ru' });
  });

  test('AC-UI-LOGIN-03: lang в запросе magic-link — текущий язык интерфейса', async () => {
    const app = await openLogin({ lang: 'el', api: { 'POST /api/auth/magic-link': ok({ ok: true }) } });

    await app.user.type(screen.getByLabelText('Email'), 'doctor1@clinic.local');
    await app.user.click(screen.getByRole('button', { name: 'Είσοδος' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Ο σύνδεσμος στάλθηκε στο email σας');
    expect(app.api.lastCall('POST /api/auth/magic-link')?.body).toEqual({ email: 'doctor1@clinic.local', lang: 'el' });
  });
});

describe('LoginPage — режим логина и пароля', () => {
  test('AC-UI-LOGIN-04: поле email скрыто, «Логин» и «Пароль» идут друг под другом', async () => {
    const app = await openLogin();
    await switchToPassword(app);

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    const login = screen.getByLabelText('Логин');
    const password = screen.getByLabelText('Пароль');
    expect(password).toHaveAttribute('type', 'password');
    expect(login.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Войти по email' })).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('button', { name: 'Войти по логину и паролю' })).not.toBeInTheDocument();
  });

  test('AC-UI-LOGIN-04: «Авторизоваться» активна, только когда заполнены оба поля', async () => {
    const app = await openLogin();
    await switchToPassword(app);

    expect(submitButton()).toBeDisabled();
    await app.user.type(screen.getByLabelText('Логин'), 'root');
    expect(submitButton()).toBeDisabled();
    await app.user.type(screen.getByLabelText('Пароль'), 'root1234');
    expect(submitButton()).toBeEnabled();
    await app.user.clear(screen.getByLabelText('Логин'));
    expect(submitButton()).toBeDisabled();
  });

  test('AC-UI-LOGIN-04: неверный логин или пароль → текст ошибки «Неверный логин или пароль»', async () => {
    mockApi({ 'POST /api/auth/login': fail(401, 'INVALID_CREDENTIALS') });
    const app = await openLogin();
    await switchToPassword(app);

    await app.user.type(screen.getByLabelText('Логин'), 'root');
    await app.user.type(screen.getByLabelText('Пароль'), 'wrong-pass');
    await app.user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
    expect(app.location().pathname).toBe('/login');
    expect(app.api.lastCall('POST /api/auth/login')?.body).toEqual({ login: 'root', password: 'wrong-pass' });
  });

  test('AC-UI-LOGIN-04: 429 → «Слишком много попыток. Попробуйте позже.»', async () => {
    mockApi({ 'POST /api/auth/login': fail(429, 'TOO_MANY_REQUESTS') });
    const app = await openLogin();
    await switchToPassword(app);

    await app.user.type(screen.getByLabelText('Логин'), 'root');
    await app.user.type(screen.getByLabelText('Пароль'), 'root1234');
    await app.user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много попыток. Попробуйте позже.');
  });

  test('AC-UI-LOGIN-04: успешный вход по логину и паролю → переход на /records, в шапке «Выйти»', async () => {
    const app = await openLogin({
      api: {
        'POST /api/auth/login': () => {
          setSessionUser(ME.root);
          return ok({ user: ME.root });
        },
      },
    });
    await switchToPassword(app);

    await app.user.type(screen.getByLabelText('Логин'), 'root');
    await app.user.type(screen.getByLabelText('Пароль'), 'root1234');
    await app.user.click(submitButton());

    await waitFor(() => expect(app.location().pathname).toBe('/records'));
    expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(app.api.lastCall('POST /api/auth/login')?.body).toEqual({ login: 'root', password: 'root1234' });
  });

  test('AC-UI-LOGIN-04: «Войти по email» возвращает к форме с email', async () => {
    const app = await openLogin();
    await switchToPassword(app);

    await app.user.click(screen.getByRole('button', { name: 'Войти по email' }));

    expect(await screen.findByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.queryByLabelText('Логин')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти по логину и паролю' })).toBeInTheDocument();
  });
});

describe('MagicLinkPage', () => {
  test('AC-UI-LOGIN-05: /auth/magic?token выполняет вход и переводит на «Записи» (replace), verify вызывается один раз', async () => {
    const app = await renderApp('/auth/magic?token=tok_123-abc', {
      me: 'guest',
      strict: true,
      api: {
        'POST /api/auth/magic-link/verify': () => {
          setSessionUser(ME.doctor);
          return ok({ user: ME.doctor });
        },
      },
    });

    await waitFor(() => expect(app.location().pathname).toBe('/records'));
    expect(app.location().navigationType).toBe('REPLACE');
    expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    const calls = app.api.callsTo('POST /api/auth/magic-link/verify');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ token: 'tok_123-abc' });
  });

  test('AC-UI-LOGIN-05: пока идёт проверка ссылки, показывается «Выполняется вход…»', async () => {
    const verify = deferred<MockReply>();
    const app = await renderApp('/auth/magic?token=abc', {
      me: 'guest',
      api: { 'POST /api/auth/magic-link/verify': () => verify.promise },
    });

    expect(await screen.findByText('Выполняется вход…')).toBeInTheDocument();
    expect(app.location().pathname).toBe('/auth/magic');

    await act(async () => {
      verify.resolve(fail(401, 'LINK_EXPIRED'));
    });
  });

  test('AC-UI-LOGIN-05: просроченная ссылка → «Ссылка устарела. Запросите новую.» и ссылка на вход', async () => {
    const app = await renderApp('/auth/magic?token=old', {
      me: 'guest',
      api: { 'POST /api/auth/magic-link/verify': fail(401, 'LINK_EXPIRED') },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка устарела. Запросите новую.');
    expect(screen.getByRole('link', { name: 'Перейти ко входу' })).toHaveAttribute('href', '/login');
    expect(app.location().pathname).toBe('/auth/magic');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  test.each<[string, string, MockReply | null]>([
    ['LINK_INVALID', '/auth/magic?token=used', fail(401, 'LINK_INVALID')],
    ['400', '/auth/magic?token=x', fail(400, 'VALIDATION_ERROR', ['token'])],
    ['пустой token', '/auth/magic', null],
  ])('AC-UI-LOGIN-05: %s → «Ссылка недействительна или уже использована.» и ссылка на вход', async (_label, path, reply) => {
    await renderApp(path, {
      me: 'guest',
      api: reply ? { 'POST /api/auth/magic-link/verify': reply } : {},
    });

    expect(await screen.findByText('Ссылка недействительна или уже использована.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти ко входу' })).toHaveAttribute('href', '/login');
  });
});
