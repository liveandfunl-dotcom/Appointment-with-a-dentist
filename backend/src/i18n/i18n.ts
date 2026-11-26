import el from './el.json';
import en from './en.json';
import ru from './ru.json';

/** Языки интерфейса и писем (api.md, раздел 1). */
export const LANGS = ['ru', 'en', 'el'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'ru';

const DICTS: Record<Lang, unknown> = { ru, en, el };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/** Строка по ключу вида `mail.magicLink.subject` с подстановкой `{{var}}` (api.md, раздел 5). */
export function translate(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  let node: unknown = DICTS[lang];
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`i18n: нет ключа ${key} для ${lang}`);
  return node.replace(/\{\{(\w+)\}\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
