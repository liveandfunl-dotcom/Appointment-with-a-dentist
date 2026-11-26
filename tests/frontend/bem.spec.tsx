/**
 * AC-STYLE-03 — имена CSS-классов во frontend/src/**\/*.css соответствуют БЭМ
 * (docs/specs/ui/screens.md, раздел 8).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const SRC = resolve(ROOT, 'frontend/src');

/** Регулярка имени класса из раздела 8 спеки. */
const BEM = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$/;
/** Извлечение имён классов из селектора (раздел 8 спеки). */
const CLASS_IN_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/g;

function findCssFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...findCssFiles(full));
    else if (name.endsWith('.css')) files.push(full);
  }
  return files.sort();
}

/**
 * Имена классов из CSS: комментарии, строки и url(...) вырезаются, классы берутся только из
 * селекторов (текст перед `{`), чтобы не ловить значения свойств.
 */
function extractClassNames(css: string): string[] {
  const cleaned = css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/url\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*)\s*\)/gi, 'url()')
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');
  const names: string[] = [];
  const chunks = cleaned.split('{');
  for (const chunk of chunks.slice(0, -1)) {
    const prelude = chunk.slice(Math.max(chunk.lastIndexOf('}'), chunk.lastIndexOf(';')) + 1).trim();
    if (prelude.startsWith('@')) continue; // @media, @supports, @keyframes, …
    for (const m of prelude.matchAll(CLASS_IN_SELECTOR)) names.push(m[1]);
  }
  return names;
}

function violations(css: string): string[] {
  return [...new Set(extractClassNames(css).filter((name) => !BEM.test(name)))];
}

describe('БЭМ', () => {
  test('AC-STYLE-03: проверка различает корректные и некорректные имена классов (самопроверка теста)', () => {
    const good = `
      /* .badComment */
      .header { background: url(".x__y__z.png"); }
      .header__nav, .date-picker__day--selected:hover, .records-table__row--cancelled > td { color: red; }
      .doctor-card--inactive .doctor-card__edit[aria-label="a.bC"] { opacity: .5; margin: 0.5em 1.5rem; }
      @media (max-width: 600px) { .booking__aside { display: none; } }
      .button:not(.button--primary):disabled { content: '.notAClass'; }
    `;
    expect(extractClassNames(good)).toEqual([
      'header',
      'header__nav',
      'date-picker__day--selected',
      'records-table__row--cancelled',
      'doctor-card--inactive',
      'doctor-card__edit',
      'booking__aside',
      'button',
      'button--primary',
    ]);
    expect(violations(good)).toEqual([]);

    const bad = '.dateDayPicker {} .a__b__c {} .block_elem {} .block--mod--extra {} .Header {} .-x {} ._y {} .b__ {}';
    expect(violations(bad)).toEqual([
      'dateDayPicker',
      'a__b__c',
      'block_elem',
      'block--mod--extra',
      'Header',
      '-x',
      '_y',
      'b__',
    ]);
  });

  test('AC-STYLE-03: все имена классов во frontend/src/**/*.css соответствуют БЭМ', () => {
    const files = findCssFiles(SRC);
    if (files.length === 0) {
      throw new Error('AC-STYLE-03: не найдено ни одного css-файла в frontend/src — проверять нечего');
    }

    const report: Record<string, string[]> = {};
    let total = 0;
    for (const file of files) {
      const css = readFileSync(file, 'utf8');
      total += extractClassNames(css).length;
      const bad = violations(css);
      if (bad.length > 0) report[relative(ROOT, file)] = bad;
    }

    expect(report).toEqual({});
    expect(total).toBeGreaterThan(0);
  });
});
