import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { today } from './dates';

// Хелперы UI. Селекторы — только роли, label и текст (screens.md, 1.1), тексты — RU (язык по умолчанию).

export function header(page: Page): Locator {
  return page.getByRole('banner');
}

export function mainMenu(page: Page): Locator {
  return header(page).getByRole('navigation', { name: 'Главное меню' });
}

/** Открытый попап с вопросом `title` (role="dialog", доступное имя = текст вопроса). */
export function dialog(page: Page, title: string): Locator {
  return page.getByRole('dialog', { name: title });
}

/** Кнопка дня в DatePicker (screens.md, раздел 4): листает месяцы кнопками «‹»/«›», пока не появится день с aria-label = 'YYYY-MM-DD'. */
export async function dayButton(page: Page, iso: string): Promise<Locator> {
  const day = page.getByRole('button', { name: iso, exact: true });
  const nav = page.getByRole('button', { name: iso < today() ? 'Предыдущий месяц' : 'Следующий месяц' });
  await expect(nav, 'DatePicker не отображается').toBeVisible();
  for (let i = 0; i < 24 && !(await day.isVisible()); i++) await nav.click();
  return day;
}

/** Выбирает дату в DatePicker. */
export async function pickDate(page: Page, iso: string): Promise<void> {
  await (await dayButton(page, iso)).click();
}

/** Тексты опций `<select>` по порядку. */
export async function optionTexts(select: Locator): Promise<string[]> {
  await select.waitFor({ state: 'visible', timeout: 10_000 });
  return (await select.locator('option').allTextContents()).map((t) => t.trim());
}

/** Опции «HH:mm» с шагом 30 минут от `from` до `to` включительно. */
export function timeRange(from: string, to: string): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(from); m <= toMin(to); m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

/**
 * На «Запись на приём»: выбирает врача (если `doctorName` задан) и дату, ждёт свободные окна,
 * выбирает время начала и длительность и нажимает «Записать». После этого открыта «Форма записи».
 */
export async function chooseSlot(
  page: Page,
  opts: { doctorName?: string; date: string; start?: string; duration?: string },
): Promise<{ start: string }> {
  if (page.url().endsWith('/booking') === false) await page.goto('/booking');
  if (opts.doctorName) await page.getByLabel('Врач', { exact: true }).selectOption({ label: opts.doctorName });
  await pickDate(page, opts.date);
  const startSelect = page.getByLabel('Время начала', { exact: true });
  await expect(startSelect).toBeEnabled();
  let start = opts.start;
  if (!start) {
    // первое свободное время начала (опция после «—»)
    start = (await optionTexts(startSelect)).find((t) => /^\d{2}:\d{2}$/.test(t));
    if (!start) throw new Error(`Нет свободного времени на ${opts.date}`);
  }
  await startSelect.selectOption({ label: start });
  if (opts.duration) await page.getByLabel('Длительность', { exact: true }).selectOption({ label: opts.duration });
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(page).toHaveURL(/\/booking\/form$/);
  return { start };
}

/** 'HH:mm' + минуты → 'HH:mm'. */
export function addMinutes(time: string, minutes: number): string {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
