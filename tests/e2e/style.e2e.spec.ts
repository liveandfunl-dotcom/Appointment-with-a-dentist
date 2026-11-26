import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { nextWorkingDate } from './support/dates';
import { CLINIC_TZ } from './support/env';
import { ADMIN, DOCTOR5, fullName } from './support/seed';
import { chooseSlot, dialog, header } from './support/ui';

// AC-STYLE-01, AC-STYLE-02 — проверка по docs/specs/ui/screens.md, 7.3 (computed styles в браузере).

test.use({ timezoneId: CLINIC_TZ, actionTimeout: 10_000 });

interface BackgroundReport {
  body: { color: string; rgba: number[] };
  headerCount: number;
  dialogCount: number;
  checked: number;
  dark: { el: string; color: string; brightness: number }[];
}

/**
 * AC-STYLE-01: computed background-color у body, header, видимых button/input/select/textarea и [role="dialog"].
 * Прозрачные (alpha = 0) пропускаются, остальные — яркость 0.299·R + 0.587·G + 0.114·B ≥ 170.
 */
async function backgrounds(page: Page): Promise<BackgroundReport> {
  return page.evaluate(() => {
    const parse = (c: string): number[] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}${
        el.textContent?.trim() ? ` «${el.textContent.trim().slice(0, 30)}»` : ''
      }`;

    const bodyColor = getComputedStyle(document.body).backgroundColor;
    const els = [
      document.body,
      ...document.querySelectorAll('header, button, input, select, textarea, [role="dialog"]'),
    ].filter(visible);
    const dark: { el: string; color: string; brightness: number }[] = [];
    let checked = 0;
    for (const el of els) {
      const color = getComputedStyle(el).backgroundColor;
      const [r, g, b, a] = parse(color);
      if (a === 0) continue;
      checked++;
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness < 170) dark.push({ el: describe(el), color, brightness: Math.round(brightness) });
    }
    return {
      body: { color: bodyColor, rgba: parse(bodyColor) },
      headerCount: document.querySelectorAll('header').length,
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      checked,
      dark,
    };
  });
}

async function expectLightWarmPalette(page: Page, where: string): Promise<BackgroundReport> {
  const report = await backgrounds(page);
  const [r, g, b, a] = report.body.rgba;
  expect(a, `${where}: у body задан фон (сейчас ${report.body.color})`).toBeGreaterThan(0);
  expect(report.body.color, `${where}: фон body не #fff`).not.toBe('rgb(255, 255, 255)');
  expect(r, `${where}: фон body тёплый, R > B (${report.body.color})`).toBeGreaterThan(b);
  expect(0.299 * r + 0.587 * g + 0.114 * b, `${where}: фон body светлый`).toBeGreaterThanOrEqual(170);
  expect(report.headerCount, `${where}: есть <header>`).toBeGreaterThan(0);
  expect(report.dark, `${where}: тёмные фоны`).toEqual([]);
  return report;
}

interface FieldReport {
  fields: number;
  problems: string[];
}

/**
 * AC-STYLE-02: для каждого поля внутри <main> — border-radius 4–8px, связанный label выше поля
 * (label.bottom ≤ field.top), между соседними полями ≥ 12px. Чекбоксы и радиокнопки — не поля ввода
 * в смысле 7.2 (их label стоит рядом), они пропускаются.
 */
async function fieldLayout(page: Page): Promise<FieldReport> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return { fields: 0, problems: ['нет <main>'] };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const fields = [
      ...main.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'),
    ].filter((f) => !['checkbox', 'radio', 'hidden'].includes((f as HTMLInputElement).type) && visible(f));

    const problems: string[] = [];
    const name = (f: Element) => `${f.tagName.toLowerCase()}#${f.id || '?'}`;
    const blocks: { name: string; rect: { top: number; bottom: number; left: number; right: number } }[] = [];

    for (const f of fields) {
      const s = getComputedStyle(f);
      for (const corner of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const) {
        const px = parseFloat(s[corner]);
        if (!(px >= 4 && px <= 8)) problems.push(`${name(f)}: ${corner} = ${s[corner]} (нужно 4–8px)`);
      }
      const fr = f.getBoundingClientRect();
      const label = f.labels?.[0];
      if (!label || !visible(label)) {
        problems.push(`${name(f)}: нет видимого связанного <label>`);
        blocks.push({ name: name(f), rect: fr });
        continue;
      }
      const lr = label.getBoundingClientRect();
      if (lr.bottom > fr.top + 0.5) {
        problems.push(`${name(f)}: label «${label.textContent?.trim()}» не над полем (label.bottom ${lr.bottom} > field.top ${fr.top})`);
      }
      blocks.push({
        name: name(f),
        rect: {
          top: Math.min(lr.top, fr.top),
          bottom: Math.max(lr.bottom, fr.bottom),
          left: Math.min(lr.left, fr.left),
          right: Math.max(lr.right, fr.right),
        },
      });
    }

    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1].rect;
      const b = blocks[i].rect;
      const sepY = Math.max(b.top - a.bottom, a.top - b.bottom);
      const sepX = Math.max(b.left - a.right, a.left - b.right);
      const gap = Math.max(sepX, sepY);
      if (gap < 12 - 0.5) problems.push(`${blocks[i - 1].name} → ${blocks[i].name}: отступ ${gap.toFixed(1)}px (нужно ≥ 12px)`);
    }
    return { fields: fields.length, problems };
  });
}

async function expectFieldLayout(page: Page, where: string, minFields: number): Promise<void> {
  await expect(page.getByRole('main')).toBeVisible();
  const report = await fieldLayout(page);
  expect(report.fields, `${where}: полей в <main>`).toBeGreaterThanOrEqual(minFields);
  expect(report.problems, where).toEqual([]);
}

test.describe('Стилистика', () => {
  test('AC-STYLE-01: у гостя палитра тёплая и светлая — /login, /doctors', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Вход' })).toBeVisible();
    await expectLightWarmPalette(page, '/login');

    await page.getByRole('button', { name: 'Войти по логину и паролю' }).click();
    await expect(page.getByLabel('Логин', { exact: true })).toBeVisible();
    await expectLightWarmPalette(page, '/login (логин и пароль)');

    await page.goto('/doctors');
    await expect(page.getByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeVisible();
    await expectLightWarmPalette(page, '/doctors');
  });

  test('AC-STYLE-01: у вошедшего палитра тёплая и светлая на всех страницах и в попапе', async ({ page }) => {
    await loginAs(page, ADMIN);
    const pages: [string, string][] = [
      ['/records', 'Записи'],
      ['/booking', 'Запись на приём'],
      ['/doctors', 'Карточки врачей'],
      ['/doctors/new', 'Добавить врача'],
    ];
    for (const [path, title] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expectLightWarmPalette(page, path);
    }

    // форма записи открывается только с выбранным слотом
    await page.goto('/booking');
    await chooseSlot(page, { doctorName: fullName(DOCTOR5), date: nextWorkingDate(DOCTOR5.workDays, 3) });
    await expect(page.getByRole('heading', { level: 1, name: 'Форма записи' })).toBeVisible();
    await expectLightWarmPalette(page, '/booking/form');

    // попап (выход): диалог светлый, кнопки в нём светлые
    await header(page).getByRole('button', { name: 'Выйти' }).click();
    await expect(dialog(page, 'Действительно выйти из системы?')).toBeVisible();
    const report = await expectLightWarmPalette(page, 'попап выхода');
    expect(report.dialogCount).toBeGreaterThan(0);
    await dialog(page, 'Действительно выйти из системы?').getByRole('button', { name: 'Нет' }).click();
  });

  test('AC-STYLE-02: поля — скругление 4–8px, label над полем, отступ между полями ≥ 12px (вход, карточки)', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expectFieldLayout(page, '/login (email)', 1);

    await page.getByRole('button', { name: 'Войти по логину и паролю' }).click();
    await expect(page.getByLabel('Логин', { exact: true })).toBeVisible();
    await expectFieldLayout(page, '/login (логин и пароль)', 2);

    await page.goto('/doctors');
    await expect(page.getByLabel('Поиск', { exact: true })).toBeVisible();
    await expectFieldLayout(page, '/doctors', 1);
  });

  test('AC-STYLE-02: поля — скругление 4–8px, label над полем, отступ между полями ≥ 12px (формы врача и записи)', async ({
    page,
  }) => {
    await loginAs(page, ADMIN);

    await page.goto('/doctors/new');
    await expect(page.getByLabel('Фамилия', { exact: true })).toBeVisible();
    await expectFieldLayout(page, '/doctors/new', 10);

    await page.goto('/booking');
    await expect(page.getByLabel('Врач', { exact: true })).toBeVisible();
    await expectFieldLayout(page, '/booking', 1);

    await chooseSlot(page, { doctorName: fullName(DOCTOR5), date: nextWorkingDate(DOCTOR5.workDays, 3) });
    await expect(page.getByLabel('Имя пациента', { exact: true })).toBeVisible();
    await expectFieldLayout(page, '/booking/form', 6);
  });
});
