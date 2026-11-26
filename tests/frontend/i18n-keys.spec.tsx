/**
 * AC-I18N-02 (фронтенд) — frontend/src/i18n/{ru,en,el}.json: одинаковый набор ключей,
 * все ключи раздела 6 спеки docs/specs/ui/screens.md присутствуют, тексты совпадают со спекой.
 *
 * Файлы читаются через fs (без import), чтобы их отсутствие давало понятное падение.
 * Ожидаемые ключи и тексты берутся из таблицы раздела 6 спеки — единственного источника истины.
 * Ключи бэкенда (backend/src/i18n) проверяет tests/api/i18n-backend.spec.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const I18N_DIR = resolve(ROOT, 'frontend/src/i18n');
const SPEC = resolve(ROOT, 'docs/specs/ui/screens.md');
const LANGS = ['ru', 'en', 'el'] as const;
type Lang = (typeof LANGS)[number];

type Flat = Map<string, unknown>;

function flatten(value: unknown, prefix: string, out: Flat): Flat {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, value);
  }
  return out;
}

function loadLocale(lang: Lang): Flat {
  const file = resolve(I18N_DIR, `${lang}.json`);
  if (!existsSync(file)) {
    throw new Error(`AC-I18N-02: файл переводов не найден: frontend/src/i18n/${lang}.json`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`AC-I18N-02: frontend/src/i18n/${lang}.json — некорректный JSON: ${(e as Error).message}`, {
      cause: e,
    });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`AC-I18N-02: frontend/src/i18n/${lang}.json должен быть JSON-объектом`);
  }
  return flatten(parsed, '', new Map());
}

/** Таблица раздела 6 спеки: ключ → { ru, en, el }. */
function loadSpecTexts(): Map<string, Record<Lang, string>> {
  const md = readFileSync(SPEC, 'utf8');
  const start = md.indexOf('## 6.');
  const end = md.indexOf('\n## ', start + 1);
  if (start < 0) throw new Error('в docs/specs/ui/screens.md не найден раздел «## 6.»');
  const section = md.slice(start, end < 0 ? undefined : end);
  const rows = new Map<string, Record<Lang, string>>();
  for (const line of section.split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim());
    if (cells.length !== 3) throw new Error(`раздел 6 спеки: неожиданная строка таблицы: ${line}`);
    rows.set(m[1], { ru: cells[0], en: cells[1], el: cells[2] });
  }
  if (rows.size < 100 || !rows.has('header.menu.records') || !rows.has('doctorForm.notFound')) {
    throw new Error(`раздел 6 спеки разобран неверно: найдено ключей ${rows.size}`);
  }
  return rows;
}

function difference(a: Iterable<string>, b: Set<string>): string[] {
  return [...a].filter((k) => !b.has(k)).sort();
}

describe('i18n json (frontend)', () => {
  test.each(LANGS)('AC-I18N-02: frontend/src/i18n/%s.json существует, это вложенный JSON с непустыми строками в листьях', (lang) => {
    const flat = loadLocale(lang);
    expect(flat.size).toBeGreaterThan(0);
    const badLeaves = [...flat].filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k);
    expect(badLeaves).toEqual([]);
    const dottedKeys = [...flat.keys()].filter((k) => k.split('.').some((part) => part === ''));
    expect(dottedKeys).toEqual([]);
  });

  test('AC-I18N-02: во всех трёх json одинаковый набор ключей', () => {
    const [ru, en, el] = LANGS.map(loadLocale);
    const ruKeys = new Set(ru.keys());
    const report = {
      'есть в ru, нет в en': difference(ru.keys(), new Set(en.keys())),
      'есть в en, нет в ru': difference(en.keys(), ruKeys),
      'есть в ru, нет в el': difference(ru.keys(), new Set(el.keys())),
      'есть в el, нет в ru': difference(el.keys(), ruKeys),
    };
    expect(report).toEqual({
      'есть в ru, нет в en': [],
      'есть в en, нет в ru': [],
      'есть в ru, нет в el': [],
      'есть в el, нет в ru': [],
    });
  });

  test.each(LANGS)('AC-I18N-02: в %s.json есть все ключи раздела 6 спеки', (lang) => {
    const spec = loadSpecTexts();
    const flat = loadLocale(lang);
    expect(difference(spec.keys(), new Set(flat.keys()))).toEqual([]);
  });

  test.each(LANGS)('AC-I18N-01: тексты %s.json совпадают с разделом 6 спеки', (lang) => {
    const spec = loadSpecTexts();
    const flat = loadLocale(lang);
    const mismatches = [...spec]
      .filter(([key, texts]) => flat.get(key) !== texts[lang])
      .map(([key, texts]) => ({ key, expected: texts[lang], actual: flat.get(key) }));
    expect(mismatches).toEqual([]);
  });
});
