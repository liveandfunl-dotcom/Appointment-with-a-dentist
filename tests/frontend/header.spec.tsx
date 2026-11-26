/**
 * Шапка, меню по ролям, закрытые маршруты и выход (docs/specs/ui/screens.md, разделы 2, 3.1, 3.3).
 * AC-UI-HEADER-01…03, AC-UI-LOGOUT-01.
 */
import { act, screen, waitFor, within } from '@testing-library/react';

import { deferred, fail, mockApi, type MockReply } from './support/api-mock';
import { renderApp, type MeOption } from './support/render';

const MENU = {
  records: { name: 'Записи', href: '/records' },
  booking: { name: 'Запись на приём', href: '/booking' },
  doctors: { name: 'Карточки врачей', href: '/doctors' },
  bookingForm: { name: 'Форма записи', href: '/booking/form' },
  addDoctor: { name: 'Добавить врача', href: '/doctors/new' },
};

/** Дождаться, пока AuthContext получит ответ /api/auth/me (в шапке появится «Войти» или «Выйти»). */
async function waitForAuth(me: MeOption) {
  const name = me === null || me === 'guest' ? 'Войти' : 'Выйти';
  return within(await screen.findByRole('banner')).findByRole('button', { name });
}

function menuLinks() {
  const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Главное меню' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => ({ name: a.textContent?.trim(), href: a.getAttribute('href') }));
}

describe('Шапка', () => {
  test.each<[string, MeOption]>([
    ['/doctors', 'guest'],
    ['/login', 'guest'],
    ['/auth/magic', 'guest'],
    ['/records', 'doctor'],
    ['/booking', 'doctor'],
    ['/booking/form', 'doctor'],
    ['/doctors', 'doctor'],
    ['/doctors/new', 'admin'],
    ['/doctors/5/edit', 'root'],
  ])('AC-UI-HEADER-01: на странице %s (%s) есть шапка: меню, выбор языка, Войти/Выйти', async (path, me) => {
    await renderApp(path, { me });

    await waitForAuth(me);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('navigation', { name: 'Главное меню' })).toBeInTheDocument();
    expect(within(banner).getByRole('combobox', { name: 'Язык' })).toBeInTheDocument();
    const authButton = within(banner).getByRole('button', { name: me === 'guest' ? 'Войти' : 'Выйти' });
    expect(authButton.tagName).toBe('BUTTON');
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  test('AC-UI-HEADER-02: гость видит в меню только «Карточки врачей»', async () => {
    await renderApp('/doctors', { me: 'guest' });
    await waitForAuth('guest');

    expect(menuLinks()).toEqual([MENU.doctors]);
  });

  test('AC-UI-HEADER-02: врач видит «Записи», «Запись на приём», «Карточки врачей», «Форма записи»', async () => {
    await renderApp('/doctors', { me: 'doctor' });
    await waitForAuth('doctor');

    expect(menuLinks()).toEqual([MENU.records, MENU.booking, MENU.doctors, MENU.bookingForm]);
  });

  test.each<[MeOption]>([['admin'], ['root']])(
    'AC-UI-HEADER-02: %s видит ещё и «Добавить врача»',
    async (me) => {
      await renderApp('/doctors', { me });
      await waitForAuth(me);

      expect(menuLinks()).toEqual([MENU.records, MENU.booking, MENU.doctors, MENU.bookingForm, MENU.addDoctor]);
    },
  );

  test('AC-UI-HEADER-02: активный пункт меню помечен aria-current="page", переход по ссылке меню меняет страницу', async () => {
    const app = await renderApp('/doctors', { me: 'admin' });
    await waitForAuth('admin');

    const nav = screen.getByRole('navigation', { name: 'Главное меню' });
    expect(within(nav).getByRole('link', { name: 'Карточки врачей' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Записи' })).not.toHaveAttribute('aria-current');

    await app.user.click(within(nav).getByRole('link', { name: 'Записи' }));
    await waitFor(() => expect(app.location().pathname).toBe('/records'));
    expect(within(nav).getByRole('link', { name: 'Записи' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument();
  });

  test('AC-UI-HEADER-01: гость по кнопке «Войти» попадает на /login', async () => {
    const app = await renderApp('/doctors', { me: 'guest' });
    const login = await waitForAuth('guest');

    await app.user.click(login);
    await waitFor(() => expect(app.location().pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument();
  });
});

describe('Закрытые маршруты', () => {
  test.each(['/records', '/booking', '/booking/form', '/doctors/new', '/doctors/7/edit'])(
    'AC-UI-HEADER-03: гость, открывший %s, попадает на /login (replace)',
    async (path) => {
      const app = await renderApp(path, { me: 'guest' });

      expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument();
      expect(app.location().pathname).toBe('/login');
      expect(app.location().navigationType).toBe('REPLACE');
    },
  );

  test('AC-UI-HEADER-03: пока /api/auth/me не ответил, закрытая страница показывает «Загрузка…» и не редиректит', async () => {
    const me = deferred<MockReply>();
    mockApi({ 'GET /api/auth/me': () => me.promise });
    const app = await renderApp('/records');

    expect(await screen.findByText('Загрузка…')).toBeInTheDocument();
    expect(app.location().pathname).toBe('/records');
    expect(screen.queryByRole('heading', { level: 1, name: 'Вход' })).not.toBeInTheDocument();

    await act(async () => {
      me.resolve(fail(401, 'UNAUTHORIZED'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument();
    expect(app.location().pathname).toBe('/login');
  });

  test('AC-UI-HEADER-03: вошедший пользователь на закрытой странице остаётся на ней', async () => {
    const app = await renderApp('/records', { me: 'doctor' });
    await waitForAuth('doctor');

    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument();
    expect(app.location().pathname).toBe('/records');
  });

  test('AC-UI-HEADER-03: при старте выполняется GET /api/auth/me', async () => {
    const app = await renderApp('/doctors', { me: 'doctor' });
    await waitForAuth('doctor');

    expect(app.api.callsTo('GET /api/auth/me').length).toBeGreaterThanOrEqual(1);
  });
});

describe('Выход', () => {
  test('AC-UI-LOGOUT-01: «Выйти» открывает попап «Действительно выйти из системы?» с кнопками «Да» и «Нет»', async () => {
    const app = await renderApp('/doctors', { me: 'doctor' });
    await app.user.click(await waitForAuth('doctor'));

    const dialog = await screen.findByRole('dialog', { name: 'Действительно выйти из системы?' });
    expect(within(dialog).getByRole('button', { name: 'Да' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Нет' })).toBeInTheDocument();
  });

  test('AC-UI-LOGOUT-01: «Нет» закрывает попап, пользователь остаётся в системе', async () => {
    const app = await renderApp('/records', { me: 'doctor' });
    await app.user.click(await waitForAuth('doctor'));

    const dialog = await screen.findByRole('dialog', { name: 'Действительно выйти из системы?' });
    await app.user.click(within(dialog).getByRole('button', { name: 'Нет' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(app.api.callsTo('POST /api/auth/logout')).toHaveLength(0);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(app.location().pathname).toBe('/records');
  });

  test('AC-UI-LOGOUT-01: «Да» вызывает POST /api/auth/logout, в шапке появляется «Войти», меню гостя, переход на /doctors', async () => {
    const app = await renderApp('/records', { me: 'admin' });
    await app.user.click(await waitForAuth('admin'));

    const dialog = await screen.findByRole('dialog', { name: 'Действительно выйти из системы?' });
    await app.user.click(within(dialog).getByRole('button', { name: 'Да' }));

    expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(app.api.callsTo('POST /api/auth/logout')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    expect(menuLinks()).toEqual([MENU.doctors]);
    await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
  });
});
