import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toIso, todayIso } from '../../utils/date';
import './date-picker.css';

interface DatePickerProps {
  /** 'YYYY-MM-DD' */
  value: string | null;
  onChange: (date: string) => void;
  /** true — день недоступен. */
  isDateDisabled?: (date: string) => boolean;
  /** Сегодняшняя дата 'YYYY-MM-DD' (подсветка и начальный месяц); по умолчанию — по часам браузера. */
  today?: string;
}

export function DatePicker({ value, onChange, isDateDisabled, today = todayIso() }: DatePickerProps) {
  const { t } = useTranslation();
  const [view, setView] = useState(() => {
    const [y, m] = (value ?? today).split('-').map(Number);
    return { year: y, month: m };
  });

  const { year, month } = view;
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7; // неделя с понедельника
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;

  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const cells = Array.from({ length: total }, (_, i) => {
    const day = i - leading + 1;
    if (day < 1 || day > daysInMonth) return <span key={i} className="date-picker__empty" />;

    const date = toIso(year, month, day);
    const selected = date === value;
    const disabled = isDateDisabled?.(date) ?? false;
    const classes = ['date-picker__day'];
    if (selected) classes.push('date-picker__day--selected');
    if (date === today) classes.push('date-picker__day--today');

    return (
      <button
        key={i}
        type="button"
        className={classes.join(' ')}
        aria-label={date}
        aria-pressed={selected}
        aria-disabled={disabled ? true : undefined}
        disabled={disabled}
        onClick={() => onChange(date)}
      >
        {day}
      </button>
    );
  });

  return (
    <div className="date-picker">
      <div className="date-picker__header">
        <button
          type="button"
          className="date-picker__nav"
          aria-label={t('datePicker.prevMonth')}
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <div className="date-picker__title">{`${t(`months.${month}`)} ${year}`}</div>
        <button
          type="button"
          className="date-picker__nav"
          aria-label={t('datePicker.nextMonth')}
          onClick={() => shift(1)}
        >
          ›
        </button>
      </div>
      <div className="date-picker__weekdays">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <span key={n} className="date-picker__weekday">
            {t(`weekdays.${n}`)}
          </span>
        ))}
      </div>
      <div className="date-picker__grid">{cells}</div>
    </div>
  );
}
