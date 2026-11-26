import type { Lang } from '@clinic/shared';
import { createInstance, type i18n } from 'i18next';

import el from './el.json';
import en from './en.json';
import ru from './ru.json';

export const LANGS = ['ru', 'en', 'el'] as const satisfies readonly Lang[];
export type { Lang };
export const LANG_STORAGE_KEY = 'lang';

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

/** Новый экземпляр i18next. Язык: аргумент → localStorage['lang'] → ru. */
export async function createI18n(lang?: Lang): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    lng: lang ?? storedLang() ?? 'ru',
    fallbackLng: 'ru',
    supportedLngs: [...LANGS],
    resources: { ru: { translation: ru }, en: { translation: en }, el: { translation: el } } satisfies Record<Lang, unknown>,
    interpolation: { escapeValue: false },
    initAsync: false,
  });

  const syncDocument = (lang: string) => {
    document.documentElement.lang = lang;
    document.title = instance.t('common.appTitle');
  };
  syncDocument(instance.language);
  instance.on('languageChanged', (next) => {
    syncDocument(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* localStorage недоступен — язык просто не сохранится */
    }
  });
  return instance;
}
