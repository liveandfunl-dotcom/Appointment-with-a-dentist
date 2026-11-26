/**
 * AC-UI-DP-01 — DatePicker (docs/specs/ui/screens.md, раздел 4).
 * «Сегодня» зафиксировано: четверг 26.11.2026. 1 ноября 2026 — воскресенье, 1 февраля 2027 — понедельник.
 */
import { act, screen } from '@testing-library/react';

import { DatePicker } from '../../frontend/src/components/DatePicker/DatePicker';
import { freezeTime, renderWithI18n } from './support/render';

const DAY_LABEL = /^\d{4}-\d{2}-\d{2}$/;

function dayButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: DAY_LABEL });
}

function day(date: string): HTMLElement {
  return screen.getByRole('button', { name: date });
}

/**
 * Ячейка сетки, в которой лежит кнопка дня. Глубина ячейки относительно кнопки определяется
 * по двум соседним дням одной недели (их ячейки — соседние дети общего предка). Подходит и
 * для `<table>` (td в tr), и для плоской CSS-сетки (div в контейнере).
 */
function makeCellOf(sameWeekA: HTMLElement, sameWeekB: HTMLElement) {
  const ancestors = (el: HTMLElement) => {
    const list: HTMLElement[] = [];
    for (let n: HTMLElement | null = el; n; n = n.parentElement) list.push(n);
    return list;
  };
  const a = ancestors(sameWeekA);
  const b = new Set(ancestors(sameWeekB));
  const depth = a.findIndex((n) => n.parentElement !== null && b.has(n.parentElement));
  if (depth < 0) throw new Error('не удалось найти общий контейнер ячеек сетки');
  return (button: HTMLElement): HTMLElement => {
    let cell = button;
    for (let i = 0; i < depth; i += 1) cell = cell.parentElement!;
    return cell;
  };
}

function column(cell: HTMLElement): number {
  return Array.from(cell.parentElement!.children).indexOf(cell) % 7;
}

function isEmptyCell(cell: Element): boolean {
  return cell.querySelector('button') === null && cell.tagName !== 'BUTTON' && (cell.textContent ?? '').trim() === '';
}

function expectInDocumentOrder(elements: HTMLElement[]) {
  for (let i = 1; i < elements.length; i += 1) {
    const pos = elements[i - 1].compareDocumentPosition(elements[i]);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
}

beforeEach(() => {
  freezeTime(new Date(2026, 10, 26, 10, 0));
});

describe('DatePicker', () => {
  test('AC-UI-DP-01: показывает месяц value: заголовок «Ноябрь 2026» и кнопки на каждый день месяца', async () => {
    await renderWithI18n(<DatePicker value="2026-11-10" onChange={jest.fn()} />);

    expect(screen.getByText('Ноябрь 2026')).toBeInTheDocument();
    const labels = dayButtons().map((b) => b.getAttribute('aria-label'));
    expect(labels).toHaveLength(30);
    expect(labels[0]).toBe('2026-11-01');
    expect(labels[29]).toBe('2026-11-30');
    expect(day('2026-11-10')).toHaveTextContent(/^10$/);
    expect(day('2026-11-10')).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('button', { name: '2026-10-31' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2026-12-01' })).not.toBeInTheDocument();
  });

  test('AC-UI-DP-01: без value показывается текущий месяц', async () => {
    await renderWithI18n(<DatePicker value={null} onChange={jest.fn()} />);

    expect(screen.getByText('Ноябрь 2026')).toBeInTheDocument();
    expect(day('2026-11-26')).toBeInTheDocument();
  });

  test('AC-UI-DP-01: неделя начинается с понедельника — строка дней недели Пн…Вс', async () => {
    await renderWithI18n(<DatePicker value="2026-11-10" onChange={jest.fn()} />);

    const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    expectInDocumentOrder(names.map((n) => screen.getByText(n)));
  });

  test('AC-UI-DP-01: дни стоят в колонках по дням недели, до 1-го и после последнего числа — пустые ячейки', async () => {
    await renderWithI18n(<DatePicker value="2026-11-10" onChange={jest.fn()} />);

    // 2 и 3 ноября 2026 — понедельник и вторник одной недели.
    const cellOf = makeCellOf(day('2026-11-02'), day('2026-11-03'));

    expect(column(cellOf(day('2026-11-02')))).toBe(0); // понедельник — первая колонка
    expect(column(cellOf(day('2026-11-26')))).toBe(3); // четверг
    const first = cellOf(day('2026-11-01')); // воскресенье — последняя колонка
    expect(column(first)).toBe(6);
    const before = Array.from(first.parentElement!.children).slice(0, Array.from(first.parentElement!.children).indexOf(first));
    const leading = before.slice(-6);
    expect(leading).toHaveLength(6);
    leading.forEach((cell) => expect(isEmptyCell(cell)).toBe(true));

    const last = cellOf(day('2026-11-30')); // понедельник
    expect(column(last)).toBe(0);
    const after = Array.from(last.parentElement!.children).slice(Array.from(last.parentElement!.children).indexOf(last) + 1);
    expect(after.length % 7).toBe(6);
    after.forEach((cell) => expect(isEmptyCell(cell)).toBe(true));
  });

  test('AC-UI-DP-01: кнопки «‹»/«›» листают месяцы вперёд и назад, в том числе через границу года', async () => {
    const { user } = await renderWithI18n(<DatePicker value="2026-11-10" onChange={jest.fn()} />);
    const prev = screen.getByRole('button', { name: 'Предыдущий месяц' });
    const next = screen.getByRole('button', { name: 'Следующий месяц' });
    expect(prev).toHaveTextContent('‹');
    expect(next).toHaveTextContent('›');

    await user.click(prev);
    expect(screen.getByText('Октябрь 2026')).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(31);
    expect(day('2026-10-31')).toBeInTheDocument();

    await user.click(next);
    await user.click(next);
    await user.click(next);
    expect(screen.getByText('Январь 2027')).toBeInTheDocument();
    expect(day('2027-01-01')).toBeInTheDocument();

    await user.click(next);
    expect(screen.getByText('Февраль 2027')).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(28);

    for (let i = 0; i < 14; i += 1) await user.click(prev);
    expect(screen.getByText('Декабрь 2025')).toBeInTheDocument();
    expect(day('2025-12-31')).toBeInTheDocument();
  });

  test('AC-UI-DP-01: месяц, начинающийся с понедельника (февраль 2027), не имеет пустых ячеек в начале', async () => {
    await renderWithI18n(<DatePicker value="2027-02-15" onChange={jest.fn()} />);

    expect(screen.getByText('Февраль 2027')).toBeInTheDocument();
    const cellOf = makeCellOf(day('2027-02-01'), day('2027-02-02'));
    expect(column(cellOf(day('2027-02-01')))).toBe(0);
    expect(column(cellOf(day('2027-02-28')))).toBe(6);
  });

  test('AC-UI-DP-01: клик по дню вызывает onChange("YYYY-MM-DD")', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithI18n(<DatePicker value={null} onChange={onChange} />);

    await user.click(day('2026-11-15'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-11-15');

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    await user.click(day('2026-12-03'));
    expect(onChange).toHaveBeenLastCalledWith('2026-12-03');
  });

  test('AC-UI-DP-01: выбранный день — aria-pressed="true" и date-picker__day--selected; сегодня — date-picker__day--today', async () => {
    await renderWithI18n(<DatePicker value="2026-11-10" onChange={jest.fn()} />);

    expect(day('2026-11-10')).toHaveAttribute('aria-pressed', 'true');
    expect(day('2026-11-10')).toHaveClass('date-picker__day--selected');
    expect(day('2026-11-11')).not.toHaveAttribute('aria-pressed', 'true');
    expect(day('2026-11-11')).not.toHaveClass('date-picker__day--selected');
    expect(day('2026-11-26')).toHaveClass('date-picker__day--today');
    expect(day('2026-11-25')).not.toHaveClass('date-picker__day--today');
  });

  test('AC-UI-DP-01: isDateDisabled делает день недоступным — disabled, aria-disabled, клик не вызывает onChange', async () => {
    const onChange = jest.fn();
    const isDateDisabled = jest.fn((date: string) => date < '2026-11-26' || date === '2026-11-28');
    const { user } = await renderWithI18n(
      <DatePicker value={null} onChange={onChange} isDateDisabled={isDateDisabled} />,
    );

    for (const date of ['2026-11-01', '2026-11-25', '2026-11-28']) {
      expect(day(date)).toBeDisabled();
      expect(day(date)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(day('2026-11-26')).toBeEnabled();
    expect(day('2026-11-27')).toBeEnabled();
    expect(isDateDisabled).toHaveBeenCalledWith('2026-11-25');

    await user.click(day('2026-11-25'));
    await user.click(day('2026-11-28'));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(day('2026-11-27'));
    expect(onChange).toHaveBeenCalledWith('2026-11-27');
  });

  test('AC-UI-DP-01: названия месяцев, дней недели и подписи кнопок локализованы (en) и меняются при смене языка (el)', async () => {
    const { i18n } = await renderWithI18n(<DatePicker value="2026-11-10" onChange={jest.fn()} />, { lang: 'en' });

    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expectInDocumentOrder(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => screen.getByText(n)));
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('el');
    });

    expect(screen.getByText('Νοέμβριος 2026')).toBeInTheDocument();
    expectInDocumentOrder(['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((n) => screen.getByText(n)));
    expect(screen.getByRole('button', { name: 'Προηγούμενος μήνας' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Επόμενος μήνας' })).toBeInTheDocument();
  });
});
