/**
 * Структура backend: отсутствие дублей и нарушений границ модулей
 * (docs/plans/code-quality.md, AC-REFAC-10). Проверки идут по исходникам.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '../../backend/src');

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Типы, единственное объявление которых лежит в shared/index.d.ts. */
const SHARED_NAMES = ['Role', 'Lang', 'AuthUser', 'UserCard', 'UserDetails', 'Appointment', 'TimeWindow', 'Clinic'];
const SHARED_DECLARATION = new RegExp(`^\\s*(export\\s+)?(declare\\s+)?(interface|type)\\s+(${SHARED_NAMES.join('|')})\\b`, 'm');

const FILES = sources().map((path) => ({ rel: relative(SRC, path), text: readFileSync(path, 'utf8') }));

/** Файлы, в которых встречается подстрока. */
const filesWith = (needle: string | RegExp): string[] =>
  FILES.filter(({ text }) => (typeof needle === 'string' ? text.includes(needle) : needle.test(text))).map(
    ({ rel }) => rel,
  );

describe('AC-REFAC-10: структура backend', () => {
  test.each([
    ['function parseId', /function parseId\b/],
    ['function nullableNumber', /function nullableNumber\b/],
    ['EMAIL_RE =', /\bEMAIL_RE\s*=/],
  ])('%s объявлено один раз и не в *.service.ts', (_name, pattern) => {
    const where = filesWith(pattern);
    expect(where).toHaveLength(1);
    expect(where[0]).not.toMatch(/\.service\.ts$/);
  });

  test('BEGIN IMMEDIATE — только в db/transaction.ts', () => {
    expect(filesWith('BEGIN IMMEDIATE')).toEqual([join('db', 'transaction.ts')]);
  });

  test('process.env — только в main.ts и app.factory.ts', () => {
    expect(filesWith('process.env').sort()).toEqual(['app.factory.ts', 'main.ts']);
  });

  test('INSERT INTO Users — только в users/insert-user.ts', () => {
    expect(filesWith('INSERT INTO Users')).toEqual([join('users', 'insert-user.ts')]);
  });

  test('MailService не переключается по режиму почты', () => {
    const mail = FILES.find(({ rel }) => rel === join('mail', 'mail.service.ts'));
    expect(mail).toBeDefined();
    expect(mail?.text).not.toMatch(/switch\s*\(/);
    expect(mail?.text).not.toContain("case 'memory'");
  });

  test('значения по умолчанию appUrl и timezone заданы только в app.options.ts', () => {
    expect(filesWith("'http://localhost:3000'")).toEqual(['app.options.ts']);
    expect(filesWith("'Europe/Athens'")).toEqual(['app.options.ts']);
  });

  test('сервисы не импортируют друг у друга parseId из users.service', () => {
    expect(filesWith(/import[^;]*\bparseId\b[^;]*from '\.\.\/users\/users\.service'/)).toEqual([]);
  });
});

describe('AC-CLEAN: остатки ревью (backend)', () => {
  test('AC-CLEAN-01: AuthController не разбирает тело сам', () => {
    const controller = FILES.find(({ rel }) => rel === join('auth', 'auth.controller.ts'));
    expect(controller?.text).not.toContain('invalid.push');
    expect(controller?.text).not.toContain('assertValid');
  });

  test('AC-CLEAN-02: UsersService не разбирает тело сам', () => {
    const service = FILES.find(({ rel }) => rel === join('users', 'users.service.ts'));
    expect(service?.text).not.toContain('invalid.push');
  });

  test('AC-CLEAN-03: cookie не собираются строкой Set-Cookie', () => {
    expect(filesWith("'Set-Cookie'")).toEqual([]);
  });

  test('AC-CLEAN-05: общие типы объявлены не в backend/src, а в @clinic/shared', () => {
    expect(filesWith(SHARED_DECLARATION)).toEqual([]);
  });
});

describe('AC-CLEAN-05: пакет shared', () => {
  const shared = readFileSync(join(__dirname, '../../shared/index.d.ts'), 'utf8');

  test.each(SHARED_NAMES)('объявляет %s', (name) => {
    expect(shared).toMatch(new RegExp(`export (type|interface) ${name}\\b`));
  });

  test('содержит только типы: нет рантайм-кода', () => {
    expect(shared).not.toMatch(/export (const|let|var|function|class|enum)\b/);
  });
});
