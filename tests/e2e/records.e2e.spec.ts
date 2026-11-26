import { expect, test } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { apiAs, loginAs } from './support/auth';
import { cancelAppointment, createAppointment, userIdByEmail } from './support/api';
import { addDays, formatDate, nextWorkingDate, today } from './support/dates';
import { CLINIC_TZ, uid } from './support/env';
import { ADMIN, DOCTOR1, DOCTOR5, SEED_DOCTORS, fullName } from './support/seed';
import { dialog, optionTexts, pickDate } from './support/ui';

// AC-UI-REC-01…04 (docs/specs/ui/screens.md, 5.3). Записи создаются через API, каждый тест — на свою дату.

test.use({ timezoneId: CLINIC_TZ, actionTimeout: 10_000 });

let adminApi: APIRequestContext;
let doctor1Id: number;
let doctor5Id: number;

test.beforeAll(async () => {
  adminApi = await apiAs(ADMIN);
  doctor1Id = await userIdByEmail(adminApi, DOCTOR1.email);
  doctor5Id = await userIdByEmail(adminApi, DOCTOR5.email);
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

function table(page: Page): Locator {
  return page.getByRole('main').getByRole('table');
}

function rowWith(page: Page, text: string): Locator {
  return table(page).getByRole('row').filter({ hasText: text });
}

test.describe('Записи', () => {
  test('AC-UI-REC-01: два столбца — слева список врачей («Все» по умолчанию) над календарём, справа «Выберите дату»', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);
    await page.goto('/records');
    await expect(page.getByRole('heading', { level: 1, name: 'Записи' })).toBeVisible();

    const select = page.getByLabel('Врач', { exact: true });
    const options = await optionTexts(select);
    expect(options[0]).toBe('Все');
    await expect(select).toHaveValue('');
    for (const d of SEED_DOCTORS) expect(options).toContain(fullName(d));
    expect(options).not.toContain(fullName(ADMIN));

    const nav = page.getByRole('button', { name: 'Следующий месяц' });
    const hint = page.getByText('Выберите дату', { exact: true });
    await expect(hint).toBeVisible();
    const [selectBox, navBox, hintBox] = [await select.boundingBox(), await nav.boundingBox(), await hint.boundingBox()];
    expect(navBox!.y, 'календарь под списком врачей').toBeGreaterThan(selectBox!.y);
    expect(hintBox!.x, 'правый столбец правее левого').toBeGreaterThan(selectBox!.x + selectBox!.width / 2);
  });

  test('AC-UI-REC-01: у врача в списке только он сам', async ({ page }) => {
    await loginAs(page, DOCTOR1);
    await page.goto('/records');
    const select = page.getByLabel('Врач', { exact: true });
    expect(await optionTexts(select)).toEqual([fullName(DOCTOR1)]);
  });

  test('AC-UI-REC-02: клик по дате показывает таблицу: заголовок — дата, колонки, отменённые записи помечены', async ({
    page,
  }) => {
    const date = nextWorkingDate(DOCTOR5.workDays, 7);
    const active = await createAppointment(adminApi, {
      doctorId: doctor5Id,
      date,
      start: '09:00',
      end: '10:30',
      patientName: `Активный ${uid()}`,
      patientPhone: '+30 690 100 0001',
    });
    const cancelled = await createAppointment(adminApi, {
      doctorId: doctor5Id,
      date,
      start: '11:00',
      end: '12:00',
      patientName: `Отменённый ${uid()}`,
      patientPhone: '+30 690 100 0002',
    });
    await cancelAppointment(adminApi, cancelled.id);

    await loginAs(page, ADMIN);
    await page.goto('/records');
    await pickDate(page, date);

    await expect(table(page)).toBeVisible();
    await expect(table(page).locator('caption')).toHaveText(formatDate(date));
    const headers = (await table(page).getByRole('columnheader').allTextContents()).map((t) => t.trim());
    expect(headers).toEqual(['Время', 'Врач', 'Кабинет', 'Пациент', 'Телефон', 'Действия']);

    const activeRow = rowWith(page, active.patientName);
    await expect(activeRow).toHaveCount(1);
    const cells = (await activeRow.getByRole('cell').allTextContents()).map((t) => t.trim());
    expect(cells.slice(0, 5)).toEqual(['09:00–10:30', fullName(DOCTOR5), String(DOCTOR5.room), active.patientName, '+30 690 100 0001']);
    await expect(activeRow.getByRole('button', { name: 'Отменить' })).toBeVisible();

    const cancelledRow = rowWith(page, cancelled.patientName);
    await expect(cancelledRow).toContainText('Отменена');
    await expect(cancelledRow).toContainText('11:00–12:00');
    await expect(cancelledRow).toHaveClass(/records-table__row--cancelled/);
    await expect(cancelledRow.getByRole('button', { name: 'Отменить' })).toHaveCount(0);

    // сортировка по началу
    const rows = table(page).locator('tbody').getByRole('row');
    const first = (await rows.allTextContents()).findIndex((t) => t.includes(active.patientName));
    const second = (await rows.allTextContents()).findIndex((t) => t.includes(cancelled.patientName));
    expect(first).toBeLessThan(second);

    // фильтр по врачу: у doctor1 на эту дату записей этого теста нет
    await page.getByLabel('Врач', { exact: true }).selectOption({ label: fullName(DOCTOR1) });
    await expect(rowWith(page, active.patientName)).toHaveCount(0);
    await page.getByLabel('Врач', { exact: true }).selectOption({ label: fullName(DOCTOR5) });
    await expect(rowWith(page, active.patientName)).toHaveCount(1);
  });

  test('AC-UI-REC-03: если записей нет, показывается «Записей нет»', async ({ page }) => {
    // прошлая дата, на которую запись создать нельзя
    const date = addDays(today(), -35);
    await loginAs(page, ADMIN);
    await page.goto('/records');
    await pickDate(page, date);
    await expect(page.getByText('Записей нет')).toBeVisible();
    await expect(table(page)).toHaveCount(0);
  });

  test('AC-UI-REC-04: «Отменить» открывает попап; «Нет» ничего не меняет, «Да» помечает запись отменённой', async ({
    page,
  }) => {
    const date = nextWorkingDate(DOCTOR5.workDays, 8);
    const appt = await createAppointment(adminApi, {
      doctorId: doctor5Id,
      date,
      start: '15:00',
      end: '16:00',
      patientName: `Отмена ${uid()}`,
    });

    await loginAs(page, ADMIN);
    await page.goto('/records');
    await pickDate(page, date);

    const row = rowWith(page, appt.patientName);
    await row.getByRole('button', { name: 'Отменить' }).click();
    const confirm = dialog(page, 'Отменить запись?');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Нет' }).click();
    await expect(confirm).toBeHidden();
    await expect(row.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await expect(row).not.toContainText('Отменена');

    await row.getByRole('button', { name: 'Отменить' }).click();
    await dialog(page, 'Отменить запись?').getByRole('button', { name: 'Да' }).click();
    await expect(dialog(page, 'Отменить запись?')).toBeHidden();
    await expect(row).toContainText('Отменена');
    await expect(row.getByRole('button', { name: 'Отменить' })).toHaveCount(0);
    await expect(row).toHaveClass(/records-table__row--cancelled/);

    // статус сохранён на сервере: после перезагрузки запись по-прежнему отменена
    await page.reload();
    await pickDate(page, date);
    await expect(rowWith(page, appt.patientName)).toContainText('Отменена');
  });

  test('AC-UI-REC-04: врач видит только свои записи и отменяет свою будущую запись', async ({ page }) => {
    const date = nextWorkingDate(DOCTOR1.workDays, 9);
    const own = await createAppointment(adminApi, {
      doctorId: doctor1Id,
      date,
      start: '10:00',
      end: '11:00',
      patientName: `Свой ${uid()}`,
    });
    const foreign = await createAppointment(adminApi, {
      doctorId: doctor5Id,
      date,
      start: '10:00',
      end: '11:00',
      patientName: `Чужой ${uid()}`,
    });

    await loginAs(page, DOCTOR1);
    await page.goto('/records');
    await pickDate(page, date);

    const row = rowWith(page, own.patientName);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(fullName(DOCTOR1));
    await expect(rowWith(page, foreign.patientName)).toHaveCount(0);
    await expect(table(page)).not.toContainText(fullName(DOCTOR5));

    await row.getByRole('button', { name: 'Отменить' }).click();
    await dialog(page, 'Отменить запись?').getByRole('button', { name: 'Да' }).click();
    await expect(row).toContainText('Отменена');
  });
});
