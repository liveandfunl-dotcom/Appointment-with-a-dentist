import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { createAppointment } from '../../api/appointments';
import { apiErrorKey } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { FormField } from '../../components/FormField/FormField';
import { TextField } from '../../components/FormField/TextField';
import { Message } from '../../components/Message/Message';
import { formatDate } from '../../utils/date';
import './booking-form.css';

interface Slot {
  doctorId: number;
  doctorName: string;
  date: string;
  start: string;
  end: string;
}

function isSlot(value: unknown): value is Slot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.doctorId === 'number' &&
    typeof s.doctorName === 'string' &&
    typeof s.date === 'string' &&
    typeof s.start === 'string' &&
    typeof s.end === 'string'
  );
}

const SERVER_ERRORS = { SLOT_TAKEN: 'bookingForm.slotTaken', SLOT_UNAVAILABLE: 'bookingForm.slotUnavailable' };

export function BookingFormPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();
  const slot = isSlot(state) ? state : null;

  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({ name: false, phone: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** i18n-ключ ошибки сервера: переводится при рендере, поэтому следует за сменой языка. */
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null);

  if (!slot) return <Navigate to="/booking" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setServerErrorKey(null);
    const next = { name: patientName.trim() === '', phone: patientPhone.trim() === '' };
    setErrors(next);
    if (!next.name && !next.phone) setConfirmOpen(true);
  };

  const onConfirm = async () => {
    try {
      const created = await createAppointment({
        doctorId: slot.doctorId,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        comment: comment.trim(),
        lang: i18n.language,
      });
      navigate('/booking', { state: { booked: true, mailSent: created.mailSent } });
    } catch (e) {
      setServerErrorKey(apiErrorKey(e, SERVER_ERRORS));
      setConfirmOpen(false);
    }
  };

  const required = t('common.requiredField');

  return (
    <section className="booking-form">
      <h1>{t('bookingForm.title')}</h1>
      <form className="booking-form__form" noValidate onSubmit={onSubmit}>
        <TextField label={t('bookingForm.doctor')} type="text" readOnly value={slot.doctorName} />
        <TextField label={t('bookingForm.date')} type="text" readOnly value={formatDate(slot.date)} />
        <TextField label={t('bookingForm.time')} type="text" readOnly value={`${slot.start}–${slot.end}`} />
        <TextField
          label={t('bookingForm.patientName')}
          type="text"
          value={patientName}
          error={errors.name ? required : null}
          onChange={(e) => setPatientName(e.target.value)}
        />
        <TextField
          label={t('bookingForm.patientPhone')}
          type="tel"
          value={patientPhone}
          error={errors.phone ? required : null}
          onChange={(e) => setPatientPhone(e.target.value)}
        />
        <FormField label={t('bookingForm.comment')}>
          {(control) => <textarea {...control} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </FormField>
        {serverErrorKey && <Message variant="error">{t(serverErrorKey)}</Message>}
        <div className="booking-form__actions">
          <button type="submit" className="button button--primary">
            {t('bookingForm.submit')}
          </button>
          <button type="button" className="button" onClick={() => navigate('/booking')}>
            {t('common.back')}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title={t('bookingForm.confirm')}
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
