/** Разбор тел запросов auth — чистые функции (docs/plans/review-leftovers.md, AC-CLEAN-01). */
import { ApiError } from '../../backend/src/common/api-error';
import { parseLoginRequest, parseMagicLinkRequest, parseVerifyRequest } from '../../backend/src/auth/auth-fields';

function invalidFields(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return (e.getResponse() as { fields?: string[] }).fields ?? [];
    throw e;
  }
  throw new Error('ожидалась ошибка валидации');
}

describe('parseMagicLinkRequest', () => {
  test('AC-CLEAN-01: email нормализуется (trim, lowercase), lang по умолчанию ru', () => {
    expect(parseMagicLinkRequest({ email: '  Doctor1@Clinic.Local ' })).toEqual({
      email: 'doctor1@clinic.local',
      lang: 'ru',
    });
  });

  test('AC-CLEAN-01: lang берётся из тела', () => {
    expect(parseMagicLinkRequest({ email: 'a@b.cc', lang: 'en' })).toEqual({ email: 'a@b.cc', lang: 'en' });
  });

  test('AC-CLEAN-01: невалидный email → [email]', () => {
    expect(invalidFields(() => parseMagicLinkRequest({ email: 'nope' }))).toEqual(['email']);
  });

  test('AC-CLEAN-01: неизвестный язык → [lang]', () => {
    expect(invalidFields(() => parseMagicLinkRequest({ email: 'a@b.cc', lang: 'de' }))).toEqual(['lang']);
  });

  test('AC-CLEAN-01: оба невалидны → [email, lang]', () => {
    expect(invalidFields(() => parseMagicLinkRequest({ lang: 5 }))).toEqual(['email', 'lang']);
  });
});

describe('parseVerifyRequest', () => {
  test('AC-CLEAN-01: строка → token', () => {
    expect(parseVerifyRequest({ token: 'abc' })).toEqual({ token: 'abc' });
  });

  test.each([[{}], [{ token: 5 }], [{ token: null }]])('AC-CLEAN-01: %j → [token]', (body) => {
    expect(invalidFields(() => parseVerifyRequest(body))).toEqual(['token']);
  });
});

describe('parseLoginRequest', () => {
  test('AC-CLEAN-01: login обрезается, password — нет', () => {
    expect(parseLoginRequest({ login: '  doctor1 ', password: ' secret ' })).toEqual({
      login: 'doctor1',
      password: ' secret ',
    });
  });

  test('AC-CLEAN-01: пустой login → [login]', () => {
    expect(invalidFields(() => parseLoginRequest({ login: '   ', password: 'x' }))).toEqual(['login']);
  });

  test('AC-CLEAN-01: пустой password → [password]', () => {
    expect(invalidFields(() => parseLoginRequest({ login: 'a', password: '' }))).toEqual(['password']);
  });

  test('AC-CLEAN-01: оба пусты → [login, password]', () => {
    expect(invalidFields(() => parseLoginRequest({}))).toEqual(['login', 'password']);
  });
});
