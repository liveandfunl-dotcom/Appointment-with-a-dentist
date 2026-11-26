import { useTranslation } from 'react-i18next';

import type { FreeWindow } from '../../api/types';
import { FormField } from '../../components/FormField/FormField';
import { formatDuration } from '../../utils/time';
import { durationsFor, startMarks } from './booking-slots';

interface WindowsPanelProps {
  windows: FreeWindow[];
  start: string;
  duration: number;
  onStartChange(value: string): void;
  onDurationChange(value: number): void;
  onSubmit(): void;
}

/** Свободные окна врача и выбор начала и длительности записи. */
export function WindowsPanel({ windows, start, duration, onStartChange, onDurationChange, onSubmit }: WindowsPanelProps) {
  const { t } = useTranslation();

  return (
    <>
      <h2>{t('booking.windows')}</h2>
      <ul className="booking__windows">
        {windows.map((w) => (
          <li key={w.start}>{`${w.start}–${w.end}`}</li>
        ))}
      </ul>
      <FormField label={t('booking.start')}>
        {(control) => (
          <select {...control} value={start} onChange={(e) => onStartChange(e.target.value)}>
            <option value="">—</option>
            {startMarks(windows).map((mark) => (
              <option key={mark} value={mark}>
                {mark}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label={t('booking.duration')}>
        {(control) => (
          <select {...control} value={duration} disabled={!start} onChange={(e) => onDurationChange(Number(e.target.value))}>
            {durationsFor(start, windows).map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <button type="button" className="button button--primary" disabled={!start} onClick={onSubmit}>
        {t('booking.submit')}
      </button>
    </>
  );
}
