/**
 * Структура frontend: отсутствие дублей и прямых вызовов API из страниц
 * (docs/plans/code-quality.md, AC-REFAC-11). Проверки идут по исходникам.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '../../frontend/src');

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

const FILES = sources().map((path) => ({ rel: relative(SRC, path), text: readFileSync(path, 'utf8') }));
const PAGES = FILES.filter(({ rel }) => rel.startsWith('pages'));

/** Типы, единственное объявление которых лежит в shared/index.d.ts. */
const SHARED_NAMES = ['Role', 'Lang', 'AuthUser', 'UserCard', 'UserDetails', 'Appointment', 'TimeWindow', 'Clinic'];
const SHARED_DECLARATION = new RegExp(`^\\s*(export\\s+)?(declare\\s+)?(interface|type)\\s+(${SHARED_NAMES.join('|')})\\b`, 'm');

const filesWith = (pattern: RegExp): string[] => FILES.filter(({ text }) => pattern.test(text)).map(({ rel }) => rel);

describe('AC-REFAC-11: структура frontend', () => {
  test('страницы не вызывают api.get/post/patch напрямую', () => {
    const offenders = PAGES.filter(({ text }) => /\bapi\.(get|post|patch)\b/.test(text)).map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  test("страницы не содержат строк '/api/", () => {
    const offenders = PAGES.filter(({ text }) => /['"`]\/api\//.test(text)).map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  test.each([
    ['EMAIL_RE', /\bconst EMAIL_RE\b/],
    ['formatDate', /\bconst formatDate\b|function formatDate\b/],
    ['todayIso', /function todayIso\b|\bconst todayIso\b/],
    ['pad', /\bconst pad\b|function pad\b/],
  ])('%s объявлено один раз и в utils/', (_name, pattern) => {
    const where = filesWith(pattern);
    expect(where).toHaveLength(1);
    expect(where[0].startsWith('utils')).toBe(true);
  });

  test('STAFF объявлен только в auth/roles.ts', () => {
    expect(filesWith(/\bconst STAFF\b/)).toEqual([join('auth', 'roles.ts')]);
  });

  test('в страницах нет шаблона «let cancelled = false»', () => {
    const offenders = PAGES.filter(({ text }) => text.includes('let cancelled = false')).map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  test('страницы не объявляют собственные интерфейсы ответов API', () => {
    const offenders = PAGES.filter(({ text }) =>
      /interface (UserCard|UserDetails|Doctor|Appointment|FreeWindow)\b/.test(text),
    ).map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });
});

describe('AC-CLEAN: остатки ревью (frontend)', () => {
  test('AC-CLEAN-04: «let cancelled = false» только в hooks/useAsync.ts', () => {
    expect(filesWith(/let cancelled = false/)).toEqual([join('hooks', 'useAsync.ts')]);
  });

  test('AC-CLEAN-04: MagicLinkPage защищён от двойного запуска через useRef', () => {
    const page = FILES.find(({ rel }) => rel === join('pages', 'MagicLinkPage', 'MagicLinkPage.tsx'));
    expect(page?.text).toContain('useRef');
  });

  test('AC-CLEAN-05: общие типы объявлены не в frontend/src, а в @clinic/shared', () => {
    expect(filesWith(SHARED_DECLARATION)).toEqual([]);
  });
});
