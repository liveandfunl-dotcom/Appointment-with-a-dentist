import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { DatePicker } from '../../components/DatePicker/DatePicker';
import './records.css';
import './records-table.css';

interface Doctor {
  id: number;
  surname: string;
  name: string;
  role: string;
}

interface Appointment {
  id: number;
  start: string;
  end: string;
  doctor: { id: number; surname: string; name: string; room: number | null };
  patientName: string;
  patientPhone: string;
  status: 'active' | 'cancelled';
  canCancel: boolean;
}

const formatDate = (iso: string) => iso.split('-').reverse().join('.');

export function RecordsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const doctorSelectId = useId();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);

  const isDoctor = user?.role === 'doctor';
  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;
    api.get<Doctor[]>('/api/users').then(
      (users) => {
        if (!cancelled) setDoctors(users.filter((u) => u.role === 'doctor'));
      },
      () => {
        if (!cancelled) setError(t('common.genericError'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [t]);

  const selectedDoctor = isDoctor ? String(userId) : doctorId;

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const params = new URLSearchParams({ date });
    if (!isDoctor && doctorId) params.set('doctorId', doctorId);
    api.get<Appointment[]>(`/api/appointments?${params.toString()}`).then(
      (list) => {
        if (cancelled) return;
        setError(null);
        setAppointments(list);
      },
      () => {
        if (cancelled) return;
        setAppointments(null);
        setError(t('common.genericError'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [date, doctorId, isDoctor, t]);

  const confirmCancel = async () => {
    if (cancelId === null) return;
    try {
      const updated = await api.post<Appointment>(`/api/appointments/${cancelId}/cancel`);
      setAppointments((list) => list?.map((a) => (a.id === updated.id ? updated : a)) ?? null);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NOT_CANCELLABLE'
          ? t('records.notCancellable')
          : t('common.genericError'),
      );
    }
    setCancelId(null);
  };

  const visibleDoctors = isDoctor ? doctors.filter((d) => d.id === userId) : doctors;

  let content;
  if (!date) {
    content = <p className="records__hint">{t('records.selectDate')}</p>;
  } else if (appointments === null) {
    content = null;
  } else if (appointments.length === 0) {
    content = <p className="records__hint">{t('records.empty')}</p>;
  } else {
    content = (
      <table className="records-table">
        <caption className="records-table__caption">{formatDate(date)}</caption>
        <thead>
          <tr>
            <th>{t('records.colTime')}</th>
            <th>{t('records.colDoctor')}</th>
            <th>{t('records.colRoom')}</th>
            <th>{t('records.colPatient')}</th>
            <th>{t('records.colPhone')}</th>
            <th>{t('records.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr
              key={a.id}
              className={
                a.status === 'cancelled'
                  ? 'records-table__row records-table__row--cancelled'
                  : 'records-table__row'
              }
            >
              <td>{`${a.start}–${a.end}`}</td>
              <td>{`${a.doctor.surname} ${a.doctor.name}`}</td>
              <td>{a.doctor.room}</td>
              <td>{a.patientName}</td>
              <td>{a.patientPhone}</td>
              <td>
                {a.canCancel && (
                  <button type="button" className="button" onClick={() => setCancelId(a.id)}>
                    {t('records.cancelButton')}
                  </button>
                )}
                {a.status === 'cancelled' && t('records.cancelled')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="records">
      <h1 className="records__title">{t('records.title')}</h1>
      <div className="records__layout">
        <div className="records__aside">
          <div className="form-field">
            <label className="form-field__label" htmlFor={doctorSelectId}>
              {t('common.doctor')}
            </label>
            <select
              id={doctorSelectId}
              value={selectedDoctor}
              disabled={isDoctor && visibleDoctors.length === 0}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              {!isDoctor && <option value="">{t('common.all')}</option>}
              {visibleDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {`${d.surname} ${d.name}`}
                </option>
              ))}
            </select>
          </div>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="records__content">
          {error && (
            <p className="records__error" role="alert">
              {error}
            </p>
          )}
          {content}
        </div>
      </div>
      <ConfirmDialog
        open={cancelId !== null}
        title={t('records.cancelConfirm')}
        onConfirm={confirmCancel}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
}
