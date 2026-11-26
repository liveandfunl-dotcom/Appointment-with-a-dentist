import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';

import { api, ApiError } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
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

const formatDate = (iso: string) => iso.split('-').reverse().join('.');

export function BookingFormPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();
  const slot = isSlot(state) ? state : null;

  const id = useId();
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({ name: false, phone: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!slot) {
    return (
      <section className="booking-form">
        <h1>{t('bookingForm.title')}</h1>
        <p>{t('bookingForm.noSlot')}</p>
        <Link to="/booking">{t('bookingForm.toBooking')}</Link>
      </section>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const next = { name: patientName.trim() === '', phone: patientPhone.trim() === '' };
    setErrors(next);
    if (!next.name && !next.phone) setConfirmOpen(true);
  };

  const onConfirm = async () => {
    try {
      const created = await api.post<{ mailSent: boolean }>('/api/appointments', {
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
      const code = e instanceof ApiError ? e.code : '';
      setServerError(
        code === 'SLOT_TAKEN'
          ? t('bookingForm.slotTaken')
          : code === 'SLOT_UNAVAILABLE'
            ? t('bookingForm.slotUnavailable')
            : code === 'TOO_MANY_REQUESTS'
              ? t('common.tooManyRequests')
              : t('common.genericError'),
      );
      setConfirmOpen(false);
    }
  };

  const nameErrorId = `${id}-name-error`;
  const phoneErrorId = `${id}-phone-error`;

  return (
    <section className="booking-form">
      <h1>{t('bookingForm.title')}</h1>
      <form className="booking-form__form" noValidate onSubmit={onSubmit}>
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-doctor`}>
            {t('bookingForm.doctor')}
          </label>
          <input id={`${id}-doctor`} type="text" readOnly value={slot.doctorName} />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-date`}>
            {t('bookingForm.date')}
          </label>
          <input id={`${id}-date`} type="text" readOnly value={formatDate(slot.date)} />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-time`}>
            {t('bookingForm.time')}
          </label>
          <input id={`${id}-time`} type="text" readOnly value={`${slot.start}–${slot.end}`} />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-name`}>
            {t('bookingForm.patientName')}
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={patientName}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? nameErrorId : undefined}
            onChange={(e) => setPatientName(e.target.value)}
          />
          {errors.name && (
            <p className="form-field__error" id={nameErrorId} role="alert">
              {t('common.requiredField')}
            </p>
          )}
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-phone`}>
            {t('bookingForm.patientPhone')}
          </label>
          <input
            id={`${id}-phone`}
            type="tel"
            value={patientPhone}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? phoneErrorId : undefined}
            onChange={(e) => setPatientPhone(e.target.value)}
          />
          {errors.phone && (
            <p className="form-field__error" id={phoneErrorId} role="alert">
              {t('common.requiredField')}
            </p>
          )}
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-comment`}>
            {t('bookingForm.comment')}
          </label>
          <textarea id={`${id}-comment`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {serverError && (
          <p className="form-field__error" role="alert">
            {serverError}
          </p>
        )}
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
