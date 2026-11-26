import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { getFreeWindows } from '../../api/appointments';
import { listUsers } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import { DatePicker } from '../../components/DatePicker/DatePicker';
import { FormField } from '../../components/FormField/FormField';
import { Message } from '../../components/Message/Message';
import { useAsync } from '../../hooks/useAsync';
import { useToday } from '../../clinic/ClinicContext';
import { weekdayOf } from '../../utils/date';
import { fullName } from '../../utils/person';
import { toMinutes, toTime } from '../../utils/time';
import { MIN_DURATION } from './booking-slots';
import { WindowsPanel } from './WindowsPanel';
import './booking.css';

export function BookingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = location.state as { booked?: boolean; mailSent?: boolean } | null;

  const [selectedId, setSelectedId] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(MIN_DURATION);

  const users = useAsync(listUsers, []);
  const doctors = (users.data ?? []).filter((u) => u.role === 'doctor' && u.isActive);

  const isDoctor = user?.role === 'doctor';
  const doctorId = isDoctor ? user.id : Number(selectedId) || null;
  const doctor = doctors.find((d) => d.id === doctorId);
  const hasSelection = doctorId !== null && date !== null;

  const windows = useAsync(hasSelection ? () => getFreeWindows(doctorId, date) : null, [doctorId, date]);

  const today = useToday();
  const isDateDisabled = (d: string) => !doctor || d < today || !doctor.workDays.includes(weekdayOf(d));

  const resetTime = () => {
    setStart('');
    setDuration(MIN_DURATION);
  };

  const onDoctorChange = (value: string) => {
    setSelectedId(value);
    setDate(null);
    resetTime();
  };

  const onDateChange = (value: string) => {
    setDate(value);
    resetTime();
  };

  const onStartChange = (value: string) => {
    setStart(value);
    setDuration(MIN_DURATION);
  };

  const submit = () => {
    if (!doctor || !date || !start) return;
    navigate('/booking/form', {
      state: {
        doctorId: doctor.id,
        doctorName: fullName(doctor),
        date,
        start,
        end: toTime(toMinutes(start) + duration),
      },
    });
  };

  let content = null;
  if (hasSelection) {
    if (windows.loading) content = <Message variant="muted">{t('common.loading')}</Message>;
    else if (windows.error || !windows.data) content = <Message variant="error">{t('common.genericError')}</Message>;
    else if (windows.data.length === 0) content = <Message variant="muted">{t('booking.noWindows')}</Message>;
    else {
      content = (
        <WindowsPanel
          windows={windows.data}
          start={start}
          duration={duration}
          onStartChange={onStartChange}
          onDurationChange={setDuration}
          onSubmit={submit}
        />
      );
    }
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
      {users.error !== undefined && <Message variant="error">{t('common.genericError')}</Message>}
      {!hasSelection && <Message variant="muted" spaced>{t('booking.selectDoctorAndDate')}</Message>}
      <div className="booking__layout">
        <div className="booking__aside">
          <FormField label={t('common.doctor')}>
            {(control) => (
              <select {...control} value={doctorId ?? ''} disabled={isDoctor} onChange={(e) => onDoctorChange(e.target.value)}>
                {!isDoctor && <option value="">{t('booking.selectDoctor')}</option>}
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {fullName(d)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <DatePicker key={today} value={date} onChange={onDateChange} isDateDisabled={isDateDisabled} today={today} />
        </div>
        <div className="booking__content">{content}</div>
      </div>
    </section>
  );
}
