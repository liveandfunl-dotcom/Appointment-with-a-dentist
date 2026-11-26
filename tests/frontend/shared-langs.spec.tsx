/** LANGS в backend и frontend совпадают и поддержаны обеими сторонами (docs/plans/review-leftovers.md, AC-CLEAN-05). */
import { LANGS as BACKEND_LANGS, translate } from '../../backend/src/i18n/i18n';
import { LANGS as FRONTEND_LANGS, createI18n } from '../../frontend/src/i18n/index';

describe('AC-CLEAN-05: языки', () => {
  test('AC-CLEAN-05: список языков backend и frontend одинаков', () => {
    expect([...BACKEND_LANGS]).toEqual([...FRONTEND_LANGS]);
  });

  test.each([...FRONTEND_LANGS])('AC-CLEAN-05: %s есть в словарях frontend и backend', async (lang) => {
    const i18n = await createI18n(lang);
    expect(i18n.hasResourceBundle(lang, 'translation')).toBe(true);
    expect(() => translate(lang, 'mail.magicLink.subject')).not.toThrow();
  });
});
