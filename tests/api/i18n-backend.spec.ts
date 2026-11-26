// AC-I18N-02 (часть бэкенда): в backend/src/i18n/{ru,en,el}.json одинаковый набор ключей, включая вложенные.
// Шаблоны писем — docs/specs/system/api.md, раздел 5. Файлы читаются через fs, а не import,
// чтобы отсутствие файла давало понятное сообщение, а не ошибку компиляции.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const I18N_DIR = resolve(__dirname, '../../backend/src/i18n');
const LANGS = ['ru', 'en', 'el'] as const;
type Lang = (typeof LANGS)[number];

/** Ключи из раздела 5 спеки API. */
const SPEC_KEYS = [
  'mail',
  'mail.magicLink',
  'mail.magicLink.subject',
  'mail.magicLink.text',
  'mail.appointment',
  'mail.appointment.subject',
  'mail.appointment.text',
];

function load(lang: Lang): Record<string, unknown> {
  const file = resolve(I18N_DIR, `${lang}.json`);
  if (!existsSync(file)) throw new Error(`backend/src/i18n/${lang}.json не найден`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`backend/src/i18n/${lang}.json — некорректный JSON: ${(e as Error).message}`, { cause: e });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`backend/src/i18n/${lang}.json — корень должен быть объектом`);
  }
  return data as Record<string, unknown>;
}

/** Все пути ключей: и промежуточные объекты, и листья ("mail", "mail.magicLink", "mail.magicLink.subject"). */
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    const nested =
      typeof v === 'object' && v !== null && !Array.isArray(v) ? keyPaths(v as Record<string, unknown>, path) : [];
    return [path, ...nested];
  });
}

/** Листья с типом значения: 'mail.magicLink.subject' → 'string'. */
function leafTypes(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(acc, leafTypes(v as Record<string, unknown>, path));
    } else {
      acc[path] = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    }
    return acc;
  }, {});
}

describe('AC-I18N-02: переводы бэкенда backend/src/i18n', () => {
  test.each(LANGS)('AC-I18N-02: %s.json существует и содержит ключи писем из спеки', (lang) => {
    const keys = keyPaths(load(lang));
    expect(keys).toEqual(expect.arrayContaining(SPEC_KEYS));
  });

  test.each(['en', 'el'] as const)('AC-I18N-02: набор ключей %s.json совпадает с ru.json (включая вложенные)', (lang) => {
    const ru = keyPaths(load('ru')).sort();
    const other = keyPaths(load(lang)).sort();
    const missing = ru.filter((k) => !other.includes(k));
    const extra = other.filter((k) => !ru.includes(k));
    expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
  });

  test('AC-I18N-02: у одинаковых ключей во всех языках одинаковая структура (строка / объект)', () => {
    const [ru, en, el] = LANGS.map((l) => leafTypes(load(l)));
    expect(en).toEqual(ru);
    expect(el).toEqual(ru);
  });
});
