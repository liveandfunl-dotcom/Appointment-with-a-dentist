import { expect, test } from '@playwright/test';
import { loginAs, loginViaUi } from './support/auth';
import { CLINIC_TZ } from './support/env';
import { clearMailbox, extractMagicLink, plainText, waitForMessage } from './support/mailpit';
import { ADMIN, DOCTOR1, ROOT } from './support/seed';
import { dialog, header } from './support/ui';

// AC-UI-LOGIN-01…05, AC-UI-LOGOUT-01 (docs/specs/ui/screens.md: 3.3, 5.1, 5.2).

test.use({ timezoneId: CLINIC_TZ, actionTimeout: 10_000 });

test.describe('Вход', () => {
  test('AC-UI-LOGIN-01: на странице входа поле email, «Авторизоваться» активна только при корректном email, есть «Войти по логину и паролю»', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Вход' })).toBeVisible();

    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('type', 'email');

    const submit = page.getByRole('button', { name: 'Авторизоваться' });
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Войти по логину и паролю' })).toBeVisible();

    for (const bad of ['doctor1', 'doctor1@', 'doctor1@clinic', '@clinic.local', 'a b@clinic.local']) {
      await email.fill(bad);
      await expect(submit, `email «${bad}»`).toBeDisabled();
    }
    await email.fill('  doctor1@clinic.local  ');
    await expect(submit).toBeEnabled();
  });

  test('AC-UI-LOGIN-02: для неизвестного email под полем красный текст ошибки, ввод убирает ошибку', async ({ page }) => {
    await page.goto('/login');
    const email = page.getByLabel('Email', { exact: true });
    await email.fill(`nobody.${Date.now()}@clinic.local`);
    await page.getByRole('button', { name: 'Авторизоваться' }).click();

    const error = page.getByRole('alert').filter({ hasText: 'Пользователь с таким email не найден' });
    await expect(error).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    // под полем
    const [fieldBox, errorBox] = [await email.boundingBox(), await error.boundingBox()];
    expect(errorBox!.y).toBeGreaterThanOrEqual(fieldBox!.y + fieldBox!.height - 1);

    // красный: --color-error #C62828
    const color = await error.evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = color.match(/\d+(\.\d+)?/g)!.map(Number);
    expect(r, `цвет ошибки ${color}`).toBeGreaterThan(150);
    expect(g, `цвет ошибки ${color}`).toBeLessThan(100);
    expect(b, `цвет ошибки ${color}`).toBeLessThan(100);

    await email.press('End');
    await email.pressSequentially('x');
    await expect(error).toBeHidden();
  });

  test('AC-UI-LOGIN-03: для существующего email показывается «Ссылка отправлена на почту», письмо приходит в Mailpit', async ({
    page,
  }) => {
    await clearMailbox();
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(DOCTOR1.email);
    await page.getByRole('button', { name: 'Авторизоваться' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Ссылка отправлена на почту' })).toBeVisible();

    const mail = await waitForMessage(DOCTOR1.email, (m) => m.Subject === 'Вход в систему записи');
    expect(plainText(mail)).toContain(`Здравствуйте, ${DOCTOR1.name}!`);
    expect(extractMagicLink(mail).url).toMatch(/^http:\/\/localhost:4173\/auth\/magic\?token=[A-Za-z0-9_-]+$/);
  });

  test('AC-UI-LOGIN-04: вход по логину и паролю — поля друг под другом, кнопка активна при заполненных полях, ошибка, «Войти по email», вход root/root1234', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Войти по логину и паролю' }).click();

    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    const login = page.getByLabel('Логин', { exact: true });
    const password = page.getByLabel('Пароль', { exact: true });
    await expect(login).toBeVisible();
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute('type', 'password');

    // друг под другом: «Пароль» ниже «Логин»
    const [loginBox, passwordBox] = [await login.boundingBox(), await password.boundingBox()];
    expect(passwordBox!.y).toBeGreaterThanOrEqual(loginBox!.y + loginBox!.height);

    const submit = page.getByRole('button', { name: 'Авторизоваться' });
    await expect(submit).toBeDisabled();
    await login.fill(ROOT.login);
    await expect(submit).toBeDisabled();
    await password.fill('wrong-password');
    await expect(submit).toBeEnabled();
    await login.fill('');
    await expect(submit).toBeDisabled();

    // неверный пароль → ошибка
    await login.fill(ROOT.login);
    await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Неверный логин или пароль' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // «Войти по email» возвращает к форме с email
    await page.getByRole('button', { name: 'Войти по email' }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Логин', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Пароль', { exact: true })).toHaveCount(0);

    // успешный вход root/root1234 → «Записи»
    await loginViaUi(page, ROOT);
    await expect(page.getByRole('heading', { level: 1, name: 'Записи' })).toBeVisible();
  });

  test('AC-UI-LOGIN-04: вход по логину и паролю врача doctor1 открывает «Записи»', async ({ page }) => {
    await loginViaUi(page, DOCTOR1);
    await expect(page.getByRole('heading', { level: 1, name: 'Записи' })).toBeVisible();
    const me = await page.request.get('/api/auth/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ surname: DOCTOR1.surname, name: DOCTOR1.name, role: 'doctor' });
  });

  test('AC-UI-LOGIN-05: magic link из письма Mailpit выполняет вход doctor1@clinic.local и переводит на «Записи»', async ({
    page,
    browser,
  }) => {
    await clearMailbox();
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(DOCTOR1.email);
    await page.getByRole('button', { name: 'Авторизоваться' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Ссылка отправлена на почту' })).toBeVisible();

    const mail = await waitForMessage(DOCTOR1.email, (m) => m.Subject === 'Вход в систему записи');
    const { url } = extractMagicLink(mail);

    await page.goto(url);
    await expect(page).toHaveURL(/\/records$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Записи' })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Выйти' })).toBeVisible();

    // ссылка одноразовая: повторное открытие в новом контексте → сообщение об ошибке и ссылка на вход
    const other = await browser.newContext({ timezoneId: CLINIC_TZ });
    try {
      const page2 = await other.newPage();
      await page2.goto(url);
      await expect(page2.getByRole('alert').filter({ hasText: 'Ссылка недействительна или уже использована.' })).toBeVisible();
      await expect(page2).toHaveURL(/\/auth\/magic\?token=/);
      await page2.getByRole('link', { name: 'Перейти ко входу' }).click();
      await expect(page2).toHaveURL(/\/login$/);
    } finally {
      await other.close();
    }
  });

  test('AC-UI-LOGIN-05: недействительный токен в /auth/magic показывает ошибку и ссылку на вход', async ({ page }) => {
    // Просроченную ссылку (LINK_EXPIRED, 30 минут) в e2e не дождаться — её текст проверяют unit-тесты.
    await page.goto('/auth/magic?token=e2e-invalid-token-0000000000000000000000000');
    await expect(page.getByRole('alert').filter({ hasText: 'Ссылка недействительна или уже использована.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Перейти ко входу' })).toHaveAttribute('href', '/login');
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  });
});

test.describe('Выход', () => {
  test('AC-UI-LOGOUT-01: «Выйти» спрашивает подтверждение; «Нет» закрывает попап, «Да» завершает сессию и показывает «Войти»', async ({
    page,
  }) => {
    // отдельная сессия: выход её удаляет
    await loginAs(page, ADMIN, { fresh: true });
    await page.goto('/records');

    const logout = header(page).getByRole('button', { name: 'Выйти' });
    await logout.click();
    const confirm = dialog(page, 'Действительно выйти из системы?');
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAttribute('aria-modal', 'true');
    await expect(confirm.getByRole('button', { name: 'Да' })).toBeVisible();

    await confirm.getByRole('button', { name: 'Нет' }).click();
    await expect(confirm).toBeHidden();
    await expect(logout).toBeVisible();
    expect((await page.request.get('/api/auth/me')).status()).toBe(200);

    await logout.click();
    await dialog(page, 'Действительно выйти из системы?').getByRole('button', { name: 'Да' }).click();

    await expect(header(page).getByRole('button', { name: 'Войти' })).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Выйти' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/doctors$/);
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);

    await page.goto('/records');
    await expect(page).toHaveURL(/\/login$/);
  });
});
