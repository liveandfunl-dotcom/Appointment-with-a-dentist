import { useId, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { LANGS, type Lang } from '../../i18n/index';
import './language-select.css';

// Подписи — константы, не переводятся.
const LABELS: Record<Lang, string> = { ru: 'RU', en: 'EN', el: 'GR' };

export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const id = useId();

  const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(e.target.value);
  };

  return (
    <div className="language-select">
      <label className="visually-hidden" htmlFor={id}>
        {t('header.language')}
      </label>
      <select id={id} className="language-select__control" value={i18n.language} onChange={onChange}>
        {LANGS.map((lang) => (
          <option key={lang} value={lang}>
            {LABELS[lang]}
          </option>
        ))}
      </select>
    </div>
  );
}
