import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cancelAppointment, listAppointments } from '../../api/appointments';
import { apiErrorKey } from '../../api/errors';
import { listUsers } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToday } from '../../clinic/ClinicContext';
import { DatePicker } from '../../components/DatePicker/DatePicker';
import { FormField } from '../../components/FormField/FormField';
import { Message } from '../../components/Message/Message';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../utils/date';
import { fullName } from '../../utils/person';
import './records.css';
import './records-table.css';

export function RecordsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const today = useToday();

  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  /** i18n-ключ ошибки отмены; сбрасывается при смене врача и даты. */
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isDoctor = user?.role === 'doctor';
  const userId = user?.id;

  const users = useAsync(listUsers, []);
  const appointments = useAsync(date ? () => listAppointments(date, isDoctor ? undefined : doctorId) : null, [
    date,
    doctorId,
    isDoctor,
  ]);

  const doctors = (users.data ?? []).filter((u) => u.role === 'doctor');
  const visibleDoctors = isDoctor ? doctors.filter((d) => d.id === userId) : doctors;
  const selectedDoctor = isDoctor ? String(userId) : doctorId;
  const errorKey = cancelError ?? (users.error !== undefined || appointments.error !== undefined ? 'common.genericError' : null);

  const onDoctorChange = (value: string) => {
    setDoctorId(value);
    setCancelError(null);
  };

  const onDateChange = (value: string) => {
    setDate(value);
    setCancelError(null);
  };

  const confirmCancel = async () => {
    if (cancelId === null) return;
    try {
      const updated = await cancelAppointment(cancelId);
      if (appointments.data) appointments.setData(appointments.data.map((a) => (a.id === updated.id ? updated : a)));
      setCancelError(null);
    } catch (e) {
      setCancelError(apiErrorKey(e, { NOT_CANCELLABLE: 'records.notCancellable' }));
    }
    setCancelId(null);
  };

  let content = null;
  if (!date) {
    content = <Message variant="muted">{t('records.selectDate')}</Message>;
  } else if (appointments.data?.length === 0) {
    content = <Message variant="muted">{t('records.empty')}</Message>;
  } else if (appointments.data) {
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
          {appointments.data.map((a) => (
            <tr
              key={a.id}
              className={
                a.status === 'cancelled'
                  ? 'records-table__row records-table__row--cancelled'
                  : 'records-table__row'
              }
            >
              <td>{`${a.start}–${a.end}`}</td>
              <td>{fullName(a.doctor)}</td>
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
          <FormField label={t('common.doctor')}>
            {(control) => (
              <select
                {...control}
                value={selectedDoctor}
                disabled={isDoctor && visibleDoctors.length === 0}
                onChange={(e) => onDoctorChange(e.target.value)}
              >
                {!isDoctor && <option value="">{t('common.all')}</option>}
                {visibleDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {fullName(d)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <DatePicker key={today} value={date} onChange={onDateChange} today={today} />
        </div>
        <div className="records__content">
          {errorKey && <Message variant="error" spaced>{t(errorKey)}</Message>}
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
