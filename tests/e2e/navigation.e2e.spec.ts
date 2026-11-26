import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { CLINIC_TZ } from './support/env';
import { ADMIN, DOCTOR1, ROOT } from './support/seed';
import { header, mainMenu } from './support/ui';

// AC-UI-HEADER-01…04, AC-I18N-01 (docs/specs/ui/screens.md: 2, 3, 6).

test.use({ timezoneId: CLINIC_TZ, actionTimeout: 10_000 });

async function expectHeader(page: Page, signedIn: boolean): Promise<void> {
  const banner = header(page);
  await expect(banner, `шапка на ${page.url()}`).toBeVisible();
  await expect(mainMenu(page)).toBeVisible();
  await expect(banner.getByRole('combobox', { name: 'Язык' })).toBeVisible();
  await expect(banner.getByRole('button', { name: signedIn ? 'Выйти' : 'Войти' })).toBeVisible();
}

async function menuItems(page: Page): Promise<string[]> {
  await expect(mainMenu(page)).toBeVisible();
  return (await mainMenu(page).getByRole('link').allTextContents()).map((t) => t.trim());
}

test.describe('Шапка', () => {
  test('AC-UI-HEADER-01: у гостя на всех открытых страницах есть шапка: меню, выбор языка, «Войти»', async ({ page }) => {
    for (const path of ['/doctors', '/login', '/auth/magic?token=x']) {
      await page.goto(path);
      await expectHeader(page, false);
    }
  });

  test('AC-UI-HEADER-01: у вошедшего на всех страницах есть шапка: меню, выбор языка, «Выйти»', async ({ page }) => {
    await loginAs(page, ADMIN);
    for (const path of ['/records', '/booking', '/doctors', '/doctors/new']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expectHeader(page, true);
    }
    // меню горизонтальное: все пункты в одну строку
    const boxes = await Promise.all((await mainMenu(page).getByRole('link').all()).map((l) => l.boundingBox()));
    const tops = boxes.map((b) => Math.round(b!.y));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(4);
  });

  test('AC-UI-HEADER-02: гость видит в меню только «Карточки врачей»; «Войти» ведёт на /login', async ({ page }) => {
    await page.goto('/doctors');
    expect(await menuItems(page)).toEqual(['Карточки врачей']);
    await header(page).getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AC-UI-HEADER-02: врач видит «Записи», «Запись на приём», «Карточки врачей»', async ({ page }) => {
    await loginAs(page, DOCTOR1);
    await page.goto('/records');
    expect(await menuItems(page)).toEqual(['Записи', 'Запись на приём', 'Карточки врачей']);
  });

  for (const user of [ADMIN, ROOT]) {
    test(`AC-UI-HEADER-02: ${user.login} видит ещё «Добавить врача»; пункты меню ведут на свои страницы`, async ({ page }) => {
      await loginAs(page, user);
      await page.goto('/records');
      expect(await menuItems(page)).toEqual([
        'Записи',
        'Запись на приём',
        'Карточки врачей',
        'Добавить врача',
      ]);
      const routes: [string, string][] = [
        ['Запись на приём', '/booking'],
        ['Карточки врачей', '/doctors'],
        ['Добавить врача', '/doctors/new'],
        ['Записи', '/records'],
      ];
      for (const [label, path] of routes) {
        const link = mainMenu(page).getByRole('link', { name: label, exact: true });
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
        await expect(link).toHaveAttribute('aria-current', 'page');
      }
    });
  }

  for (const user of [DOCTOR1, ADMIN, ROOT]) {
    test(`AC-UI-HEADER-04: у ${user.login} в меню нет «Форма записи» и ссылки на /booking/form`, async ({ page }) => {
      await loginAs(page, user);
      await page.goto('/records');
      expect(await menuItems(page)).not.toContain('Форма записи');
      await expect(mainMenu(page).locator('a[href="/booking/form"]')).toHaveCount(0);
    });
  }

  test('AC-UI-HEADER-03: гость, открывший закрытую страницу, попадает на /login', async ({ page }) => {
    for (const path of ['/records', '/booking', '/booking/form', '/doctors/new', '/doctors/1/edit']) {
      await page.goto(path);
      await expect(page, `гость на ${path}`).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Вход' })).toBeVisible();
    }
    await page.goto('/');
    await expect(page).toHaveURL(/\/doctors$/);
  });
});

test.describe('Языки', () => {
  test('AC-I18N-01: по умолчанию RU; переключение EN/GR меняет тексты, выбор сохраняется после перезагрузки', async ({
    page,
  }) => {
    await page.goto('/doctors');
    const lang = () => header(page).getByRole('combobox');

    // по умолчанию RU
    await expect(lang()).toHaveValue('ru');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    expect(await lang().locator('option').allTextContents()).toEqual(['RU', 'EN', 'GR']);
    await expect(page.getByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Войти' })).toBeVisible();

    // EN
    await header(page).getByRole('combobox', { name: 'Язык' }).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'Doctors' })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(header(page).getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Doctors' })).toBeVisible();
    await expect(page.getByLabel('Search', { exact: true })).toBeVisible();
    await expect(page.getByText('Карточки врачей')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');

    await page.reload();
    await expect(lang()).toHaveValue('en');
    await expect(page.getByRole('heading', { level: 1, name: 'Doctors' })).toBeVisible();

    // GR (value el)
    await header(page).getByRole('combobox', { name: 'Language' }).selectOption({ label: 'GR' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'el');
    await expect(page.getByRole('heading', { level: 1, name: 'Κάρτες γιατρών' })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Σύνδεση' })).toBeVisible();
    await expect(page.getByLabel('Αναζήτηση', { exact: true })).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Σύνδεση' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Είσοδος με όνομα χρήστη και κωδικό' })).toBeVisible();
    await page.reload();
    await expect(lang()).toHaveValue('el');

    // обратно RU
    await header(page).getByRole('combobox', { name: 'Γλώσσα' }).selectOption('ru');
    await expect(page.getByRole('heading', { level: 1, name: 'Вход' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти по логину и паролю' })).toBeVisible();
  });

  test('AC-I18N-01: язык переключает тексты меню и страниц у вошедшего пользователя', async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto('/records');
    await header(page).getByRole('combobox', { name: 'Язык' }).selectOption('en');
    expect(await menuItems(page)).toEqual(['Appointments', 'Book an appointment', 'Doctors', 'Add doctor']);
    await expect(page.getByRole('heading', { level: 1, name: 'Appointments' })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Sign out' })).toBeVisible();

    await header(page).getByRole('combobox', { name: 'Language' }).selectOption('el');
    expect(await menuItems(page)).toEqual(['Ραντεβού', 'Κλείσιμο ραντεβού', 'Κάρτες γιατρών', 'Προσθήκη γιατρού']);
    await expect(header(page).getByRole('button', { name: 'Αποσύνδεση' })).toBeVisible();

    await page.goto('/booking');
    await expect(page.getByRole('heading', { level: 1, name: 'Κλείσιμο ραντεβού' })).toBeVisible();
  });
});
