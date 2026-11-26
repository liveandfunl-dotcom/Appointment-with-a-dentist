import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DatePicker } from '../../components/DatePicker/DatePicker';
import './booking.css';

interface Doctor {
  id: number;
  surname: string;
  name: string;
  role: 'doctor' | 'admin';
  workDays: number[];
  isActive: boolean;
}

interface FreeWindow {
  start: string;
  end: string;
}

interface WindowsResult {
  key: string;
  windows: FreeWindow[] | null; // null — ошибка запроса
}

const STEP = 30;
const MIN_DURATION = 60;

const pad = (n: number) => String(n).padStart(2, '0');
const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** День недели 1 (пн) … 7 (вс). */
function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() || 7;
}

export function BookingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = location.state as { booked?: boolean; mailSent?: boolean } | null;

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(MIN_DURATION);
  const [result, setResult] = useState<WindowsResult | null>(null);
  const [usersFailed, setUsersFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<Doctor[]>('/api/users').then(
      (users) => {
        if (!cancelled) setDoctors(users.filter((u) => u.role === 'doctor' && u.isActive));
      },
      () => {
        if (!cancelled) setUsersFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const isDoctor = user?.role === 'doctor';
  const doctorId = isDoctor ? user.id : Number(selectedId) || null;
  const doctor = doctors.find((d) => d.id === doctorId);
  const key = doctorId !== null && date ? `${doctorId}|${date}` : null;

  useEffect(() => {
    if (key === null) return;
    const [id, day] = key.split('|');
    let cancelled = false;
    api.get<FreeWindow[]>(`/api/doctors/${id}/free-windows?date=${day}`).then(
      (windows) => {
        if (!cancelled) setResult({ key, windows });
      },
      () => {
        if (!cancelled) setResult({ key, windows: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const today = todayIso();
  const isDateDisabled = (d: string) => !doctor || d < today || !doctor.workDays.includes(weekday(d));

  const onDoctorChange = (value: string) => {
    setSelectedId(value);
    setDate(null);
    setStart('');
    setDuration(MIN_DURATION);
  };

  const onDateChange = (value: string) => {
    setDate(value);
    setStart('');
    setDuration(MIN_DURATION);
  };

  const onStartChange = (value: string) => {
    setStart(value);
    setDuration(MIN_DURATION);
  };

  const windows = result && result.key === key ? result.windows : undefined;
  const startMarks = (windows ?? []).flatMap((w) => {
    const marks: string[] = [];
    for (let m = toMinutes(w.start); m + MIN_DURATION <= toMinutes(w.end); m += STEP) marks.push(toTime(m));
    return marks;
  });
  const startWindow = start ? windows?.find((w) => toMinutes(w.start) <= toMinutes(start) && toMinutes(start) < toMinutes(w.end)) : undefined;
  const durations: number[] = [];
  if (start && startWindow) {
    for (let d = MIN_DURATION; toMinutes(start) + d <= toMinutes(startWindow.end); d += STEP) durations.push(d);
  }

  const submit = () => {
    if (!doctor || !date || !start) return;
    navigate('/booking/form', {
      state: {
        doctorId: doctor.id,
        doctorName: `${doctor.surname} ${doctor.name}`,
        date,
        start,
        end: toTime(toMinutes(start) + duration),
      },
    });
  };

  let content;
  if (key === null) {
    content = null;
  } else if (windows === undefined) {
    content = <p>{t('common.loading')}</p>;
  } else if (windows === null) {
    content = (
      <p className="form-field__error" role="alert">
        {t('common.genericError')}
      </p>
    );
  } else if (windows.length === 0) {
    content = <p>{t('booking.noWindows')}</p>;
  } else {
    content = (
      <>
        <h2>{t('booking.windows')}</h2>
        <ul className="booking__windows">
          {windows.map((w) => (
            <li key={w.start}>{`${w.start}–${w.end}`}</li>
          ))}
        </ul>
        <div className="form-field">
          <label className="form-field__label" htmlFor="booking-start">
            {t('booking.start')}
          </label>
          <select id="booking-start" value={start} onChange={(e) => onStartChange(e.target.value)}>
            <option value="">—</option>
            {startMarks.map((mark) => (
              <option key={mark} value={mark}>
                {mark}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="booking-duration">
            {t('booking.duration')}
          </label>
          <select
            id="booking-duration"
            value={duration}
            disabled={!start}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="button button--primary" disabled={!start} onClick={submit}>
          {t('booking.submit')}
        </button>
      </>
    );
  }

  return (
    <section className="booking">
      <h1 className="booking__title">{t('booking.title')}</h1>
      {flash?.booked && (
        <div className="booking__success" role="status">
          <p>{t('booking.success')}</p>
          {flash.mailSent === false && <p>{t('booking.mailNotSent')}</p>}
        </div>
      )}
      {usersFailed && (
        <p className="form-field__error" role="alert">
          {t('common.genericError')}
        </p>
      )}
      {key === null && <p className="booking__hint">{t('booking.selectDoctorAndDate')}</p>}
      <div className="booking__layout">
        <div className="booking__aside">
          <div className="form-field">
            <label className="form-field__label" htmlFor="booking-doctor">
              {t('common.doctor')}
            </label>
            <select
              id="booking-doctor"
              value={doctorId ?? ''}
              disabled={isDoctor}
              onChange={(e) => onDoctorChange(e.target.value)}
            >
              {!isDoctor && <option value="">{t('booking.selectDoctor')}</option>}
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {`${d.surname} ${d.name}`}
                </option>
              ))}
            </select>
          </div>
          <DatePicker value={date} onChange={onDateChange} isDateDisabled={isDateDisabled} />
        </div>
        <div className="booking__content">{content}</div>
      </div>
    </section>
  );
}
