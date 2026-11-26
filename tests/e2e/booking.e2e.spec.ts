import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { apiAs, loginAs } from './support/auth';
import { createAppointment, createDoctor, userIdByEmail } from './support/api';
import { addDays, formatDate, nextDayOff, nextWorkingDate, today } from './support/dates';
import { CLINIC_TZ, uid } from './support/env';
import { clearMailbox, plainText, waitForMessage } from './support/mailpit';
import { ADMIN, DOCTOR2, DOCTOR5, SEED_DOCTORS, fullName } from './support/seed';
import { addMinutes, chooseSlot, dayButton, dialog, mainMenu, optionTexts, pickDate, timeRange } from './support/ui';

// AC-UI-BOOK-01…05, AC-UI-FORM-01…05 (docs/specs/ui/screens.md: 5.4, 5.5; письмо — api.md, раздел 5).
// Записи делаются к doctor5 (принимает каждый день 08:00–20:00). Каждый тест берёт свою дату
// (смещение от сегодня), чтобы тесты не делили свободные окна между собой.

test.use({ timezoneId: CLINIC_TZ, actionTimeout: 10_000 });

const DOCTOR5_NAME = fullName(DOCTOR5);

let adminApi: APIRequestContext;
let doctor5Id: number;

test.beforeAll(async () => {
  adminApi = await apiAs(ADMIN);
  doctor5Id = await userIdByEmail(adminApi, DOCTOR5.email);
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

/** Заполняет форму записи и подтверждает «Да». */
async function fillAndConfirm(page: Page, patientName: string, patientPhone: string, comment?: string): Promise<void> {
  await page.getByLabel('Имя пациента', { exact: true }).fill(patientName);
  await page.getByLabel('Телефон', { exact: true }).fill(patientPhone);
  if (comment) await page.getByLabel('Комментарий', { exact: true }).fill(comment);
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  const confirm = dialog(page, 'Подтвердить запись');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Да' }).click();
}

test.describe('Запись на приём', () => {
  test('AC-UI-BOOK-01: слева список активных врачей над календарём, у admin первая опция «Выберите врача»', async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto('/booking');
    await expect(page.getByRole('heading', { level: 1, name: 'Запись на приём' })).toBeVisible();

    const select = page.getByLabel('Врач', { exact: true });
    await expect(select).toBeEnabled();
    const options = await optionTexts(select);
    expect(options[0]).toBe('Выберите врача');
    await expect(select).toHaveValue('');
    for (const d of SEED_DOCTORS) expect(options).toContain(fullName(d));
    expect(options).not.toContain(fullName(ADMIN));

    // список над календарём, левый столбец левее правого
    const nav = page.getByRole('button', { name: 'Следующий месяц' });
    const [selectBox, calendarBox] = [await select.boundingBox(), await nav.boundingBox()];
    expect(calendarBox!.y).toBeGreaterThan(selectBox!.y);
    await expect(page.getByText('Выберите врача и дату')).toBeVisible();
    const hint = await page.getByText('Выберите врача и дату').boundingBox();
    expect(hint!.x).toBeGreaterThan(selectBox!.x + selectBox!.width / 2);
  });

  test('AC-UI-BOOK-01: врачу он сам выбран заранее, список заблокирован; врач записывает пациента только к себе', async ({
    page,
  }) => {
    await clearMailbox();
    await loginAs(page, DOCTOR5);
    await page.goto('/booking');

    const select = page.getByLabel('Врач', { exact: true });
    await expect(select).toBeDisabled();
    expect(await select.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent?.trim())).toBe(DOCTOR5_NAME);

    const date = nextWorkingDate(DOCTOR5.workDays, 6);
    const { start } = await chooseSlot(page, { date });
    await expect(page.getByLabel('Врач', { exact: true })).toHaveValue(DOCTOR5_NAME);

    const patient = `Пациент врача ${uid()}`;
    await fillAndConfirm(page, patient, '+30 690 111 2233');
    await expect(page).toHaveURL(/\/booking$/);
    await expect(page.getByRole('status').filter({ hasText: 'Пациент записан' })).toBeVisible();

    const mail = await waitForMessage(DOCTOR5.email, (m) => plainText(m).includes(patient));
    expect(plainText(mail)).toContain(`${formatDate(date)} ${start}–${addMinutes(start, 60)}`);
  });

  test('AC-UI-BOOK-02: в календаре недоступны прошедшие и нерабочие дни врача', async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto('/booking');

    // врач не выбран — все дни недоступны
    const tomorrow = addDays(today(), 1);
    await expect(await dayButton(page, tomorrow)).toBeDisabled();

    await page.getByLabel('Врач', { exact: true }).selectOption({ label: fullName(DOCTOR2) }); // Пн, Ср, Пт

    const yesterday = addDays(today(), -1);
    const past = await dayButton(page, yesterday);
    await expect(past).toBeDisabled();
    await expect(past).toHaveAttribute('aria-disabled', 'true');

    const working = nextWorkingDate(DOCTOR2.workDays, 1);
    const dayOff = nextDayOff(DOCTOR2.workDays, 1);
    for (const [date, enabled] of ([
      [working, true],
      [dayOff, false],
    ] as const).toSorted((a, b) => a[0].localeCompare(b[0]))) {
      const btn = await dayButton(page, date);
      if (enabled) await expect(btn, `рабочий день ${date}`).toBeEnabled();
      else await expect(btn, `выходной ${date}`).toBeDisabled();
    }
    // клик по недоступному дню не выбирает его
    await (await dayButton(page, dayOff)).click({ force: true });
    await expect(await dayButton(page, dayOff)).not.toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Выберите врача и дату')).toBeVisible();
  });

  test('AC-UI-BOOK-03: после выбора врача и даты — свободное время, время начала с шагом 30 минут, длительность от 1 часа и неактивная «Записать»', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/booking');
    await page.getByLabel('Врач', { exact: true }).selectOption({ label: DOCTOR5_NAME });
    const date = nextWorkingDate(DOCTOR5.workDays, 3);
    await pickDate(page, date);

    await expect(page.getByRole('heading', { name: 'Свободное время' })).toBeVisible();
    await expect(page.getByText('08:00–20:00')).toBeVisible();

    const start = page.getByLabel('Время начала', { exact: true });
    const duration = page.getByLabel('Длительность', { exact: true });
    const submit = page.getByRole('button', { name: 'Записать', exact: true });

    expect(await optionTexts(start)).toEqual(['—', ...timeRange('08:00', '19:00')]);
    await expect(start).toHaveValue('');
    await expect(duration).toBeDisabled();
    await expect(submit).toBeDisabled();

    await start.selectOption({ label: '08:00' });
    await expect(duration).toBeEnabled();
    expect((await duration.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent))?.trim()).toBe('1:00');
    const durations = await optionTexts(duration);
    expect(durations[0]).toBe('1:00');
    expect(durations[1]).toBe('1:30');
    expect(durations.at(-1)).toBe('12:00');
    expect(durations).toHaveLength(23);

    await start.selectOption({ label: '19:00' });
    expect(await optionTexts(duration)).toEqual(['1:00']);
  });

  test('AC-UI-BOOK-04: «Записать» активна, когда время выбрано, и открывает «Форму записи» с выбранным слотом', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/booking');
    await page.getByLabel('Врач', { exact: true }).selectOption({ label: DOCTOR5_NAME });
    const date = nextWorkingDate(DOCTOR5.workDays, 3);
    await pickDate(page, date);

    const submit = page.getByRole('button', { name: 'Записать', exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Время начала', { exact: true }).selectOption({ label: '10:00' });
    await page.getByLabel('Длительность', { exact: true }).selectOption({ label: '1:30' });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/\/booking\/form$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Форма записи' })).toBeVisible();
    await expect(page.getByLabel('Врач', { exact: true })).toHaveValue(DOCTOR5_NAME);
    await expect(page.getByLabel('Дата', { exact: true })).toHaveValue(formatDate(date));
    await expect(page.getByLabel('Время', { exact: true })).toHaveValue('10:00–11:30');
  });

  test('AC-UI-BOOK-05: если свободных окон нет, показывается «Нет свободного времени»', async ({ page }) => {
    // отдельный врач с часом приёма, этот час целиком занят
    const doctor = await createDoctor(adminApi, { workStart: '09:00', workEnd: '10:00' });
    const date = addDays(today(), 2);
    await createAppointment(adminApi, { doctorId: doctor.id, date, start: '09:00', end: '10:00' });

    await loginAs(page, ADMIN);
    await page.goto('/booking');
    await page.getByLabel('Врач', { exact: true }).selectOption({ label: fullName(doctor) });
    await pickDate(page, date);

    await expect(page.getByText('Нет свободного времени')).toBeVisible();
    await expect(page.getByLabel('Время начала', { exact: true })).toHaveCount(0);
  });
});

test.describe('Форма записи', () => {
  test('AC-UI-FORM-01: врач, дата и время заполнены и не редактируются; поля пациента и кнопки «Записать», «Назад»', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    const date = nextWorkingDate(DOCTOR5.workDays, 3);
    await chooseSlot(page, { doctorName: DOCTOR5_NAME, date, start: '12:00', duration: '2:00' });

    await expect(page.getByRole('heading', { level: 1, name: 'Форма записи' })).toBeVisible();
    const doctor = page.getByLabel('Врач', { exact: true });
    const dateField = page.getByLabel('Дата', { exact: true });
    const time = page.getByLabel('Время', { exact: true });
    await expect(doctor).toHaveValue(DOCTOR5_NAME);
    await expect(dateField).toHaveValue(formatDate(date));
    await expect(time).toHaveValue('12:00–14:00');
    for (const f of [doctor, dateField, time]) await expect(f).not.toBeEditable();

    const patientName = page.getByLabel('Имя пациента', { exact: true });
    const phone = page.getByLabel('Телефон', { exact: true });
    const comment = page.getByLabel('Комментарий', { exact: true });
    await expect(patientName).toBeEditable();
    await expect(phone).toBeEditable();
    await expect(phone).toHaveAttribute('type', 'tel');
    await expect(comment).toBeEditable();
    expect(await comment.evaluate((el) => el.tagName)).toBe('TEXTAREA');

    await expect(page.getByRole('button', { name: 'Записать', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page).toHaveURL(/\/booking$/);
  });

  test('AC-UI-FORM-02: пустые обязательные поля — ошибки под полями, попап не открывается', async ({ page }) => {
    await loginAs(page, ADMIN);
    await chooseSlot(page, { doctorName: DOCTOR5_NAME, date: nextWorkingDate(DOCTOR5.workDays, 3) });

    await page.getByLabel('Имя пациента', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Записать', exact: true }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Обязательное поле' })).toHaveCount(2);
    await expect(page.getByLabel('Имя пациента', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Телефон', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Комментарий', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/booking\/form$/);
  });

  test('AC-UI-FORM-03: admin записывает пациента к doctor5 — «Нет» закрывает попап, «Да» сохраняет, редирект с сообщением, письмо врачу', async ({
    page,
  }) => {
    await clearMailbox();
    await loginAs(page, ADMIN);
    const date = nextWorkingDate(DOCTOR5.workDays, 4);
    const { start } = await chooseSlot(page, { doctorName: DOCTOR5_NAME, date, duration: '1:30' });
    const end = addMinutes(start, 90);

    const patient = `Мария Кузнецова ${uid()}`;
    const phone = '+30 690 000 0000';
    await page.getByLabel('Имя пациента', { exact: true }).fill(patient);
    await page.getByLabel('Телефон', { exact: true }).fill(phone);
    await page.getByLabel('Комментарий', { exact: true }).fill('Болит зуб');

    // «Нет» закрывает попап, ничего не сохраняется
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    const confirm = dialog(page, 'Подтвердить запись');
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAttribute('aria-modal', 'true');
    await confirm.getByRole('button', { name: 'Нет' }).click();
    await expect(confirm).toBeHidden();
    await expect(page).toHaveURL(/\/booking\/form$/);
    await expect(page.getByLabel('Имя пациента', { exact: true })).toHaveValue(patient);

    // «Да» сохраняет
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await dialog(page, 'Подтвердить запись').getByRole('button', { name: 'Да' }).click();

    await expect(page).toHaveURL(/\/booking$/);
    await expect(page.getByRole('status').filter({ hasText: 'Пациент записан' })).toBeVisible();
    await expect(page.getByText('Письмо врачу не отправлено')).toHaveCount(0);

    // запись сохранена
    const res = await adminApi.get(`/api/appointments?date=${date}&doctorId=${doctor5Id}`);
    const saved = ((await res.json()) as { patientName: string; start: string; end: string; status: string }[]).find(
      (a) => a.patientName === patient,
    );
    expect(saved).toMatchObject({ start, end, status: 'active' });

    // письмо врачу (AC-MAIL-01, текст из api.md, раздел 5)
    const mail = await waitForMessage(DOCTOR5.email, (m) => plainText(m).includes(patient));
    expect(mail.Subject).toBe('Новая запись на приём');
    expect(plainText(mail)).toContain(
      `На приём записан ${patient}, ${formatDate(date)} ${start}–${end}. Контактный телефон: ${phone}`,
    );
  });

  test('AC-UI-FORM-04: если слот заняли (409), показывается ошибка, пользователь остаётся на форме с введёнными данными', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    const date = nextWorkingDate(DOCTOR5.workDays, 5);
    const { start } = await chooseSlot(page, { doctorName: DOCTOR5_NAME, date });

    // пока форма открыта, этот же слот занимают через API
    await createAppointment(adminApi, { doctorId: doctor5Id, date, start, end: addMinutes(start, 60) });

    const patient = `Опоздавший ${uid()}`;
    await fillAndConfirm(page, patient, '+30 690 999 9999');

    await expect(page.getByRole('alert').filter({ hasText: 'Это время уже занято. Выберите другое.' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/booking\/form$/);
    await expect(page.getByLabel('Имя пациента', { exact: true })).toHaveValue(patient);
    await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('+30 690 999 9999');
  });

  test('AC-UI-FORM-05: «Форма записи» из меню без выбранного слота — подсказка и ссылка на «Запись на приём»', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/records');
    await mainMenu(page).getByRole('link', { name: 'Форма записи' }).click();

    await expect(page).toHaveURL(/\/booking\/form$/);
    await expect(page.getByText('Сначала выберите врача, дату и время')).toBeVisible();
    await expect(page.getByLabel('Имя пациента', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Телефон', { exact: true })).toHaveCount(0);

    await page.getByRole('main').getByRole('link', { name: 'Перейти к записи на приём' }).click();
    await expect(page).toHaveURL(/\/booking$/);
  });
});
