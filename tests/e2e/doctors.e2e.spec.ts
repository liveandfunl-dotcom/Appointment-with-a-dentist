import { expect, test } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { apiAs, apiLogin, loginAs } from './support/auth';
import { createDoctor, listUsers, updateUser } from './support/api';
import { CLINIC_TZ, uid } from './support/env';
import { ADMIN, DOCTOR1, DOCTOR2, DOCTOR3, DOCTOR4, DOCTOR5, ROOT, SEED_DOCTORS, fullName } from './support/seed';
import { optionTexts, timeRange } from './support/ui';

// AC-UI-CARDS-01…03, AC-UI-DOC-01…06 (docs/specs/ui/screens.md: 5.6, 5.7).
// Новые врачи и админы — с уникальными фамилиями и email (БД общая на прогон).

test.use({ timezoneId: CLINIC_TZ, actionTimeout: 10_000 });

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

let adminApi: APIRequestContext;

test.beforeAll(async () => {
  adminApi = await apiAs(ADMIN);
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

function card(page: Page, name: string): Locator {
  return page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });
}

/** ФИ на видимых карточках. */
async function cardNames(page: Page): Promise<string[]> {
  return (await page.getByRole('main').getByRole('listitem').getByRole('heading', { level: 2 }).allTextContents()).map(
    (t) => t.trim(),
  );
}

const SEED_NAMES = SEED_DOCTORS.map(fullName);

/** Какие из сид-врачей видны (карточки, созданные другими тестами, не учитываются). */
async function visibleSeedNames(page: Page): Promise<string[]> {
  const names = await cardNames(page);
  return SEED_NAMES.filter((n) => names.includes(n));
}

function workDaysText(days: readonly number[]): string {
  return days.map((d) => WEEKDAYS[d - 1]).join(', ');
}

test.describe('Карточки врачей', () => {
  test('AC-UI-CARDS-01: гость видит список карточек: ФИ, специализация, телефон, email, кабинет, дни и часы приёма', async ({
    page,
  }) => {
    await page.goto('/doctors');
    await expect(page.getByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('list')).toBeVisible();

    for (const d of SEED_DOCTORS) {
      const c = card(page, fullName(d));
      await expect(c, fullName(d)).toHaveCount(1);
      await expect(c).toContainText(d.specialization);
      await expect(c).toContainText(d.phone);
      await expect(c).toContainText(d.email);
      await expect(c).toContainText(String(d.room));
      await expect(c).toContainText(workDaysText(d.workDays));
      await expect(c).toContainText(`${d.workStart}–${d.workEnd}`);
    }
    // гость не видит админов и иконку редактирования
    await expect(card(page, fullName(ADMIN))).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Редактировать' })).toHaveCount(0);
  });

  test('AC-UI-CARDS-02: поиск по фамилии, имени и специализации при вводе, без учёта регистра, для кириллицы, латиницы и греческого', async ({
    page,
  }) => {
    await page.goto('/doctors');
    const search = page.getByLabel('Поиск', { exact: true });
    await expect(search).toHaveAttribute('type', 'search');
    await expect(search).toHaveAttribute('placeholder', 'Фамилия, имя или специализация');
    await expect.poll(() => visibleSeedNames(page)).toEqual(SEED_NAMES);

    const cases: [string, string[]][] = [
      ['петрова', [fullName(DOCTOR2)]],
      ['ПЕТРОВА', [fullName(DOCTOR2)]],
      ['Иван', [fullName(DOCTOR1)]],
      ['  иванов  ', [fullName(DOCTOR1)]],
      ['ΠΑΠΑΔ', [fullName(DOCTOR3)]],
      ['παπαδόπουλος', [fullName(DOCTOR3)]],
      ['γιώργος', [fullName(DOCTOR3)]],
      ['ορθοδοντικός', [fullName(DOCTOR3)]],
      ['ΝΙΚΟΛ', [fullName(DOCTOR5)]],
      ['Νικολάου Μαρία', [fullName(DOCTOR5)]],
      ['μαρία νικολάου', [fullName(DOCTOR5)]],
      ['SMITH', [fullName(DOCTOR4)]],
      ['john smith', [fullName(DOCTOR4)]],
      ['orthoped', [fullName(DOCTOR4)]],
      ['Стоматолог', [fullName(DOCTOR5)]],
      ['терапевт', [fullName(DOCTOR1)]],
    ];
    for (const [query, expected] of cases) {
      await search.fill(query);
      await expect.poll(() => visibleSeedNames(page), { message: `поиск «${query}»` }).toEqual(expected);
    }

    await search.fill('zzzz-нет-такого');
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
    await expect.poll(() => cardNames(page)).toEqual([]);

    await search.fill('');
    await expect.poll(() => visibleSeedNames(page)).toEqual(SEED_NAMES);
    await expect(page.getByText('Ничего не найдено')).toHaveCount(0);
  });

  test('AC-UI-CARDS-03: admin видит иконку «Редактировать» и деактивированных с пометкой; админов не видит', async ({ page }) => {
    const inactive = await createDoctor(adminApi);
    await updateUser(adminApi, inactive.id, { isActive: false });

    await loginAs(page, ADMIN);
    await page.goto('/doctors');

    const c1 = card(page, fullName(DOCTOR1));
    await expect(c1.getByRole('link', { name: 'Редактировать' })).toBeVisible();
    const editHref = await c1.getByRole('link', { name: 'Редактировать' }).getAttribute('href');
    expect(editHref).toMatch(/^\/doctors\/\d+\/edit$/);

    const ci = card(page, fullName(inactive));
    await expect(ci).toContainText('Деактивирован');
    await expect(ci.locator('article')).toHaveClass(/doctor-card--inactive/);
    await expect(ci.getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', `/doctors/${inactive.id}/edit`);
    await expect(c1).not.toContainText('Деактивирован');

    await expect(card(page, fullName(ADMIN))).toHaveCount(0);
  });

  test('AC-UI-CARDS-03: root видит админов с пометкой «Администратор»; врач не видит иконку и деактивированных', async ({
    page,
    browser,
  }) => {
    const inactive = await createDoctor(adminApi);
    await updateUser(adminApi, inactive.id, { isActive: false });

    await loginAs(page, ROOT);
    await page.goto('/doctors');
    const adminCard = card(page, fullName(ADMIN));
    await expect(adminCard).toContainText('Администратор');
    await expect(adminCard).toContainText(ADMIN.phone);
    await expect(adminCard).toContainText(ADMIN.email);
    await expect(adminCard.getByRole('link', { name: 'Редактировать' })).toBeVisible();
    await expect(card(page, fullName(inactive))).toContainText('Деактивирован');
    await expect(card(page, fullName(ROOT))).toHaveCount(0);

    const ctx = await browser.newContext({ timezoneId: CLINIC_TZ });
    try {
      const doctorPage = await ctx.newPage();
      await loginAs(doctorPage, DOCTOR1);
      await doctorPage.goto('/doctors');
      await expect(card(doctorPage, fullName(DOCTOR1))).toHaveCount(1);
      await expect(doctorPage.getByRole('link', { name: 'Редактировать' })).toHaveCount(0);
      await expect(card(doctorPage, fullName(inactive))).toHaveCount(0);
      await expect(card(doctorPage, fullName(ADMIN))).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Добавить врача / редактирование', () => {
  test('AC-UI-DOC-01: форма «Добавить врача» — label над каждым полем, дни Пн–Вс в ряд, время 00:00–24:00 с шагом 30 минут, «Сохранить» и «Отмена»', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/doctors/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Добавить врача' })).toBeVisible();

    // у admin нет выбора роли
    await expect(page.getByRole('radio')).toHaveCount(0);

    for (const label of ['Фамилия', 'Имя', 'Специализация', 'Телефон', 'Почта', 'Кабинет', 'Логин', 'Пароль']) {
      await expect(page.getByLabel(label, { exact: true }), label).toBeVisible();
    }
    await expect(page.getByLabel('Телефон', { exact: true })).toHaveAttribute('type', 'tel');
    await expect(page.getByLabel('Почта', { exact: true })).toHaveAttribute('type', 'email');
    await expect(page.getByLabel('Кабинет', { exact: true })).toHaveAttribute('type', 'number');
    await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'password');

    // приёмные дни: 7 чекбоксов в ряд
    const days = page.getByRole('group', { name: 'Приёмные дни' });
    await expect(days).toBeVisible();
    const boxes = [];
    for (const wd of WEEKDAYS) {
      const cb = days.getByRole('checkbox', { name: wd, exact: true });
      await expect(cb, wd).toBeVisible();
      boxes.push(await cb.boundingBox());
    }
    const ys = boxes.map((b) => b!.y);
    expect(Math.max(...ys) - Math.min(...ys), 'чекбоксы в один ряд').toBeLessThanOrEqual(4);
    const xs = boxes.map((b) => b!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));

    // приёмное время: два списка 00:00–24:00, по умолчанию 09:00 и 17:00
    const time = page.getByRole('group', { name: 'Приёмное время' });
    const start = time.getByLabel('Начало', { exact: true });
    const end = time.getByLabel('Окончание', { exact: true });
    const all = timeRange('00:00', '24:00');
    expect(all).toHaveLength(49);
    expect(await optionTexts(start)).toEqual(all);
    expect(await optionTexts(end)).toEqual(all);
    expect(await start.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent?.trim())).toBe('09:00');
    expect(await end.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent?.trim())).toBe('17:00');

    // label над полем
    for (const label of ['Фамилия', 'Имя', 'Специализация', 'Телефон', 'Почта', 'Кабинет', 'Начало', 'Окончание', 'Логин', 'Пароль']) {
      const field = page.getByLabel(label, { exact: true });
      const labelEl = page.locator('main label').filter({ hasText: new RegExp(`^\\s*${label}\\s*\\*?\\s*$`) }).first();
      const [fb, lb] = [await field.boundingBox(), await labelEl.boundingBox()];
      expect(lb!.y + lb!.height, `label «${label}» над полем`).toBeLessThanOrEqual(fb!.y + 1);
    }

    await expect(page.getByRole('checkbox', { name: 'Деактивировать' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отмена' })).toBeVisible();
  });

  test('AC-UI-DOC-02: root выбирает роль; при «Администратор» поля врача скрыты; root добавляет администратора', async ({
    page,
  }) => {
    await loginAs(page, ROOT);
    await page.goto('/doctors/new');

    const role = page.getByRole('group', { name: 'Роль' });
    await expect(role.getByRole('radio', { name: 'Врач' })).toBeChecked();
    await expect(page.getByLabel('Специализация', { exact: true })).toBeVisible();

    await role.getByRole('radio', { name: 'Администратор' }).check();
    for (const label of ['Специализация', 'Кабинет']) await expect(page.getByLabel(label, { exact: true })).toBeHidden();
    await expect(page.getByRole('group', { name: 'Приёмные дни' })).toBeHidden();
    await expect(page.getByRole('group', { name: 'Приёмное время' })).toBeHidden();
    for (const label of ['Фамилия', 'Имя', 'Телефон', 'Почта', 'Логин', 'Пароль']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }

    const id = uid();
    const surname = `Админов${id}`;
    await page.getByLabel('Фамилия', { exact: true }).fill(surname);
    await page.getByLabel('Имя', { exact: true }).fill('Олег');
    await page.getByLabel('Телефон', { exact: true }).fill('+30 210 000 0200');
    await page.getByLabel('Почта', { exact: true }).fill(`admin.${id}@clinic.local`);
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page).toHaveURL(/\/doctors$/);
    const c = card(page, `${surname} Олег`);
    await expect(c).toBeVisible();
    await expect(c).toContainText('Администратор');

    const rootApi = await apiAs(ROOT);
    const created = (await listUsers(rootApi)).find((u) => u.email === `admin.${id}@clinic.local`);
    await rootApi.dispose();
    expect(created).toMatchObject({ role: 'admin', specialization: null, room: null, workDays: [] });
  });

  test('AC-UI-DOC-03: проверка обязательных полей, email, дней и «конец позже начала»; с ошибками сохранить нельзя', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/doctors/new');
    const save = page.getByRole('button', { name: 'Сохранить' });

    // пустая форма
    await save.click();
    await expect(page).toHaveURL(/\/doctors\/new$/);
    for (const label of ['Фамилия', 'Имя', 'Специализация', 'Телефон', 'Почта', 'Кабинет']) {
      await expect(page.getByLabel(label, { exact: true }), label).toHaveAttribute('aria-invalid', 'true');
    }
    await expect(page.getByRole('alert').filter({ hasText: 'Обязательное поле' })).toHaveCount(6);
    await expect(page.getByRole('alert').filter({ hasText: 'Выберите хотя бы один день' })).toBeVisible();

    // email, время, пароль без логина
    const surname = `Ошибкин${uid()}`;
    await page.getByLabel('Фамилия', { exact: true }).fill(surname);
    await page.getByLabel('Имя', { exact: true }).fill('Олег');
    await page.getByLabel('Специализация', { exact: true }).fill('Хирург');
    await page.getByLabel('Телефон', { exact: true }).fill('+30 210 000 0300');
    await page.getByLabel('Почта', { exact: true }).fill('bad-email@clinic');
    await page.getByLabel('Кабинет', { exact: true }).fill('7');
    await page.getByRole('checkbox', { name: 'Пн', exact: true }).check();
    await page.getByLabel('Начало', { exact: true }).selectOption({ label: '17:00' });
    await page.getByLabel('Окончание', { exact: true }).selectOption({ label: '17:00' });
    await page.getByLabel('Пароль', { exact: true }).fill('secret123');
    await save.click();

    await expect(page.getByRole('alert').filter({ hasText: 'Некорректный email' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Окончание должно быть позже начала' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Пароль задаётся только вместе с логином' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Обязательное поле' })).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'Выберите хотя бы один день' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/doctors\/new$/);

    // логин без пароля / короткий пароль
    await page.getByLabel('Окончание', { exact: true }).selectOption({ label: '09:00' });
    await page.getByLabel('Логин', { exact: true }).fill(`login${uid()}`);
    await page.getByLabel('Пароль', { exact: true }).fill('short');
    await save.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Окончание должно быть позже начала' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Пароль должен быть не короче 8 символов' })).toBeVisible();
    await expect(page).toHaveURL(/\/doctors\/new$/);

    // ничего не сохранено
    expect((await listUsers(adminApi)).some((u) => u.surname === surname)).toBe(false);
  });

  test('AC-UI-DOC-04: admin добавляет врача — «Сохранить» переводит на карточки, новая карточка видна, врач может войти', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/doctors/new');

    const id = uid();
    const surname = `Новиков${id}`;
    const login = `novikov${id}`;
    await page.getByLabel('Фамилия', { exact: true }).fill(surname);
    await page.getByLabel('Имя', { exact: true }).fill('Николай');
    await page.getByLabel('Специализация', { exact: true }).fill('Эндодонтист');
    await page.getByLabel('Телефон', { exact: true }).fill('+30 210 000 0400');
    await page.getByLabel('Почта', { exact: true }).fill(`novikov.${id}@clinic.local`);
    await page.getByLabel('Кабинет', { exact: true }).fill('204');
    for (const wd of ['Пн', 'Ср', 'Пт']) await page.getByRole('checkbox', { name: wd, exact: true }).check();
    await page.getByLabel('Начало', { exact: true }).selectOption({ label: '10:00' });
    await page.getByLabel('Окончание', { exact: true }).selectOption({ label: '16:30' });
    await page.getByLabel('Логин', { exact: true }).fill(login);
    await page.getByLabel('Пароль', { exact: true }).fill('novikov1234');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page).toHaveURL(/\/doctors$/);
    const c = card(page, `${surname} Николай`);
    await expect(c).toBeVisible();
    await expect(c).toContainText('Эндодонтист');
    await expect(c).toContainText('+30 210 000 0400');
    await expect(c).toContainText(`novikov.${id}@clinic.local`);
    await expect(c).toContainText('204');
    await expect(c).toContainText('Пн, Ср, Пт');
    await expect(c).toContainText('10:00–16:30');

    // новый врач входит своим логином и паролем
    await apiLogin({ login, password: 'novikov1234' });
  });

  test('AC-UI-DOC-04: «Отмена» переводит на карточки без сохранения', async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto('/doctors/new');
    const surname = `Отменов${uid()}`;
    await page.getByLabel('Фамилия', { exact: true }).fill(surname);
    await page.getByLabel('Имя', { exact: true }).fill('Иван');
    await page.getByRole('button', { name: 'Отмена' }).click();

    await expect(page).toHaveURL(/\/doctors$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeVisible();
    await expect(card(page, `${surname} Иван`)).toHaveCount(0);
    expect((await listUsers(adminApi)).some((u) => u.surname === surname)).toBe(false);
  });

  test('AC-UI-DOC-05: форма редактирования заполнена данными; изменения сохраняются, пустой пароль не меняет текущий', async ({
    page,
  }) => {
    const id = uid();
    const doctor = await createDoctor(adminApi, {
      surname: `Редактов${id}`,
      name: 'Сергей',
      specialization: 'Ортопед',
      phone: '+30 210 000 0500',
      room: 305,
      workDays: [2, 4],
      workStart: '08:30',
      workEnd: '15:00',
      login: `redaktov${id}`,
      password: 'redaktov1234',
    });

    await loginAs(page, ADMIN);
    await page.goto('/doctors');
    await page.getByLabel('Поиск', { exact: true }).fill(doctor.surname);
    await card(page, fullName(doctor)).getByRole('link', { name: 'Редактировать' }).click();

    await expect(page).toHaveURL(new RegExp(`/doctors/${doctor.id}/edit$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Редактирование карточки' })).toBeVisible();
    await expect(page.getByLabel('Фамилия', { exact: true })).toHaveValue(doctor.surname);
    await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Сергей');
    await expect(page.getByLabel('Специализация', { exact: true })).toHaveValue('Ортопед');
    await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('+30 210 000 0500');
    await expect(page.getByLabel('Почта', { exact: true })).toHaveValue(doctor.email);
    await expect(page.getByLabel('Кабинет', { exact: true })).toHaveValue('305');
    for (const [i, wd] of WEEKDAYS.entries()) {
      const cb = page.getByRole('checkbox', { name: wd, exact: true });
      if ([2, 4].includes(i + 1)) await expect(cb, wd).toBeChecked();
      else await expect(cb, wd).not.toBeChecked();
    }
    const start = page.getByLabel('Начало', { exact: true });
    const end = page.getByLabel('Окончание', { exact: true });
    expect(await start.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent?.trim())).toBe('08:30');
    expect(await end.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent?.trim())).toBe('15:00');
    await expect(page.getByLabel('Логин', { exact: true })).toHaveValue(`redaktov${id}`);
    await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
    await expect(page.getByText('Оставьте пустым, чтобы не менять')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Деактивировать' })).not.toBeChecked();

    await page.getByLabel('Телефон', { exact: true }).fill('+30 210 000 0599');
    await page.getByRole('checkbox', { name: 'Сб', exact: true }).check();
    await end.selectOption({ label: '18:00' });
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page).toHaveURL(/\/doctors$/);
    const c = card(page, fullName(doctor));
    await expect(c).toContainText('+30 210 000 0599');
    await expect(c).toContainText('Вт, Чт, Сб');
    await expect(c).toContainText('08:30–18:00');

    // пароль не изменился
    await apiLogin({ login: `redaktov${id}`, password: 'redaktov1234' });
  });

  test('AC-UI-DOC-05: «Деактивировать» помечает карточку, врач исчезает из списка на «Запись на приём» и у гостя', async ({
    page,
    browser,
  }) => {
    const doctor = await createDoctor(adminApi);

    await loginAs(page, ADMIN);
    await page.goto('/booking');
    expect(await optionTexts(page.getByLabel('Врач', { exact: true }))).toContain(fullName(doctor));

    await page.goto(`/doctors/${doctor.id}/edit`);
    await expect(page.getByLabel('Фамилия', { exact: true })).toHaveValue(doctor.surname);
    await page.getByRole('checkbox', { name: 'Деактивировать' }).check();
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page).toHaveURL(/\/doctors$/);
    await expect(card(page, fullName(doctor))).toContainText('Деактивирован');

    await page.goto('/booking');
    const options = await optionTexts(page.getByLabel('Врач', { exact: true }));
    expect(options).toContain(fullName(DOCTOR1));
    expect(options).not.toContain(fullName(doctor));

    const guest = await browser.newContext({ timezoneId: CLINIC_TZ });
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto('/doctors');
      await expect(card(guestPage, fullName(DOCTOR1))).toHaveCount(1);
      await expect(card(guestPage, fullName(doctor))).toHaveCount(0);
    } finally {
      await guest.close();
    }

    // повторная активация снимает пометку
    await page.goto(`/doctors/${doctor.id}/edit`);
    await expect(page.getByRole('checkbox', { name: 'Деактивировать' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Деактивировать' }).uncheck();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page).toHaveURL(/\/doctors$/);
    await expect(card(page, fullName(doctor))).not.toContainText('Деактивирован');
  });

  test('AC-UI-DOC-06: «Добавить врача» и редактирование доступны только admin и root', async ({ page, browser }) => {
    const doctor1Id = (await listUsers(adminApi)).find((u) => u.email === DOCTOR1.email)!.id;

    // врач → /doctors
    await loginAs(page, DOCTOR1);
    for (const path of ['/doctors/new', `/doctors/${doctor1Id}/edit`]) {
      await page.goto(path);
      await expect(page, `врач на ${path}`).toHaveURL(/\/doctors$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeVisible();
    }

    // гость → /login
    const guest = await browser.newContext({ timezoneId: CLINIC_TZ });
    try {
      const guestPage = await guest.newPage();
      for (const path of ['/doctors/new', `/doctors/${doctor1Id}/edit`]) {
        await guestPage.goto(path);
        await expect(guestPage, `гость на ${path}`).toHaveURL(/\/login$/);
      }
    } finally {
      await guest.close();
    }

    // admin и root — страницы открываются
    for (const user of [ADMIN, ROOT]) {
      const ctx = await browser.newContext({ timezoneId: CLINIC_TZ });
      try {
        const p = await ctx.newPage();
        await loginAs(p, user);
        await p.goto('/doctors/new');
        await expect(p.getByRole('heading', { level: 1, name: 'Добавить врача' })).toBeVisible();
        await p.goto(`/doctors/${doctor1Id}/edit`);
        await expect(p.getByRole('heading', { level: 1, name: 'Редактирование карточки' })).toBeVisible();
        await expect(p.getByLabel('Фамилия', { exact: true })).toHaveValue(DOCTOR1.surname);
      } finally {
        await ctx.close();
      }
    }
  });
});
