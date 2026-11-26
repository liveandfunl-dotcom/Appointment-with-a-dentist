/**
 * AC-I18N-01 — переключение языка RU/EN/GR (docs/specs/ui/screens.md, разделы 3.2, 9).
 * Набор ключей json (AC-I18N-02) проверяется отдельно в i18n-keys.spec.tsx: там нет импортов
 * frontend/src, поэтому отсутствие json даёт понятное падение, а не ошибку компиляции.
 */
import { act, screen, waitFor, within } from '@testing-library/react';

import { createI18n, LANG_STORAGE_KEY, LANGS } from '../../frontend/src/i18n/index';
import { renderApp } from './support/render';

const CYRILLIC = /[Ѐ-ӿ]/;
const GREEK = /[Ͱ-Ͽἀ-῿]/;

const languageSelect = () => within(screen.getByRole('banner')).getByRole('combobox');

async function openLoginPage(lang?: 'ru' | 'en' | 'el') {
  const app = await renderApp('/login', { me: 'guest', lang });
  await screen.findByRole('heading', { level: 1 });
  return app;
}

describe('i18n', () => {
  test('AC-I18N-01: createI18n — LANGS, ключ localStorage "lang", язык: аргумент → localStorage → ru', async () => {
    expect(LANGS).toEqual(['ru', 'en', 'el']);
    expect(LANG_STORAGE_KEY).toBe('lang');

    expect((await createI18n()).language).toBe('ru');

    localStorage.setItem('lang', 'en');
    expect((await createI18n()).language).toBe('en');
    expect((await createI18n('el')).language).toBe('el');

    localStorage.setItem('lang', 'xx');
    expect((await createI18n()).language).toBe('ru');

    const i18n = await createI18n('ru');
    await i18n.changeLanguage('el');
    expect(localStorage.getItem('lang')).toBe('el');
  });

  test('AC-I18N-01: по умолчанию RU — тексты на русском, селектор = ru, <html lang="ru">', async () => {
    await openLoginPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Карточки врачей' })).toBeInTheDocument();
    expect(languageSelect()).toHaveAccessibleName('Язык');
    expect(languageSelect()).toHaveValue('ru');
    expect(document.documentElement).toHaveAttribute('lang', 'ru');
  });

  test('AC-I18N-01: селектор языка — опции RU, EN, GR со значениями ru, en, el', async () => {
    await openLoginPage();

    const options = within(languageSelect()).getAllByRole('option');
    expect(options.map((o) => [o.textContent, (o as HTMLOptionElement).value])).toEqual([
      ['RU', 'ru'],
      ['EN', 'en'],
      ['GR', 'el'],
    ]);
  });

  test('AC-I18N-01: переключение на EN меняет все тексты, выбор сохраняется в localStorage', async () => {
    const app = await openLoginPage();

    await app.user.selectOptions(languageSelect(), 'en');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument();
    expect(banner.getByRole('link', { name: 'Doctors' })).toBeInTheDocument();
    expect(banner.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(languageSelect()).toHaveAccessibleName('Language');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with login and password' })).toBeInTheDocument();
    expect(languageSelect()).toHaveValue('en');
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(document.body.textContent).not.toMatch(CYRILLIC);
  });

  test('AC-I18N-01: переключение на GR меняет все тексты на греческий', async () => {
    const app = await openLoginPage();

    await app.user.selectOptions(languageSelect(), 'el');

    expect(await screen.findByRole('heading', { level: 1, name: 'Σύνδεση' })).toBeInTheDocument();
    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('navigation', { name: 'Κύριο μενού' })).toBeInTheDocument();
    expect(banner.getByRole('link', { name: 'Κάρτες γιατρών' })).toBeInTheDocument();
    expect(banner.getByRole('button', { name: 'Σύνδεση' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Είσοδος' })).toBeInTheDocument();
    expect(languageSelect()).toHaveAccessibleName('Γλώσσα');
    expect(document.documentElement).toHaveAttribute('lang', 'el');
    expect(localStorage.getItem('lang')).toBe('el');
    expect(document.body.textContent).not.toMatch(CYRILLIC);

    await app.user.selectOptions(languageSelect(), 'ru');
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(GREEK);
    expect(localStorage.getItem('lang')).toBe('ru');
  });

  test('AC-I18N-01: переключение меняет все тексты и у вошедшего пользователя (меню admin, форма врача)', async () => {
    const app = await renderApp('/doctors/new', { me: 'admin' });
    await screen.findByRole('heading', { level: 1, name: 'Добавить врача' });

    await app.user.selectOptions(languageSelect(), 'en');

    expect(await screen.findByRole('heading', { level: 1, name: 'Add doctor' })).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Main menu' }));
    expect(nav.getAllByRole('link').map((a) => a.textContent?.trim())).toEqual([
      'Appointments',
      'Book an appointment',
      'Doctors',
      'Add doctor',
    ]);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(CYRILLIC);
  });

  test('AC-I18N-01: выбранный язык восстанавливается после перезагрузки приложения', async () => {
    const first = await openLoginPage();
    await first.user.selectOptions(languageSelect(), 'el');
    await screen.findByRole('heading', { level: 1, name: 'Σύνδεση' });
    first.unmount();

    await renderApp('/login', { me: 'guest' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Σύνδεση' })).toBeInTheDocument();
    expect(languageSelect()).toHaveValue('el');
    expect(document.documentElement).toHaveAttribute('lang', 'el');
  });

  test('AC-I18N-01: <title> страницы переводится вместе с языком', async () => {
    const app = await openLoginPage();
    expect(document.title).toBe('Запись к стоматологу');

    await app.user.selectOptions(languageSelect(), 'en');
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(document.title).toBe('Dentist appointments');

    await app.user.selectOptions(languageSelect(), 'el');
    await screen.findByRole('heading', { level: 1, name: 'Σύνδεση' });
    expect(document.title).toBe('Ραντεβού στον οδοντίατρο');

    await app.user.selectOptions(languageSelect(), 'ru');
    await screen.findByRole('heading', { level: 1, name: 'Вход' });
    expect(document.title).toBe('Запись к стоматологу');
  });

  test('AC-I18N-01: <title> берёт язык из localStorage при загрузке', async () => {
    localStorage.setItem('lang', 'en');
    await renderApp('/login', { me: 'guest' });
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(document.title).toBe('Dentist appointments');
  });

  test('AC-I18N-01: неизвестное значение в localStorage → RU', async () => {
    localStorage.setItem('lang', 'de');
    await renderApp('/login', { me: 'guest' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument();
    expect(languageSelect()).toHaveValue('ru');
  });

  test('AC-I18N-01: смена языка через i18n.changeLanguage сразу перерисовывает тексты', async () => {
    const app = await openLoginPage();

    await act(async () => {
      await app.i18n.changeLanguage('en');
    });

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument());
    expect(languageSelect()).toHaveValue('en');
  });
});
