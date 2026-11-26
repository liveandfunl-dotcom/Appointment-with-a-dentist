import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import type { UserDetails } from '../../api/types';
import { createUser, getUser, updateUser } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import { FieldError, FormField } from '../../components/FormField/FormField';
import { TextField } from '../../components/FormField/TextField';
import { Message } from '../../components/Message/Message';
import { useAsync } from '../../hooks/useAsync';
import { TIME_MARKS } from '../../utils/time';
import { buildBody, initialValues, serverErrors, validate, type Errors, type FormValues } from './doctor-form.model';
import './doctor-form.css';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function DoctorFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  return (
    <div className="doctor-form">
      <h1>{t(id ? 'doctorForm.titleEdit' : 'doctorForm.titleNew')}</h1>
      {id ? <EditLoader key={id} id={id} /> : <DoctorForm userId={undefined} user={null} />}
    </div>
  );
}

/** Загружает пользователя для редактирования; `key={id}` сбрасывает состояние при смене id. */
function EditLoader({ id }: { id: string }) {
  const { t } = useTranslation();
  const loaded = useAsync(() => getUser(id), [id]);

  if (loaded.error instanceof ApiError && loaded.error.status === 404) return <Message variant="error">{t('doctorForm.notFound')}</Message>;
  if (loaded.error !== undefined) return <Message variant="error">{t('common.genericError')}</Message>;
  if (!loaded.data) return <Message variant="muted">{t('common.loading')}</Message>;
  return <DoctorForm userId={id} user={loaded.data} />;
}

function DoctorForm({ userId, user }: { userId: string | undefined; user: UserDetails | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const daysErrorId = useId();
  const editing = userId !== undefined;
  const [values, setValues] = useState<FormValues>(() => initialValues(user, 'doctor'));
  const [errors, setErrors] = useState<Errors>({});
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isDoctor = values.role === 'doctor';

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function toggleDay(day: number) {
    const next = values.workDays.includes(day) ? values.workDays.filter((d) => d !== day) : [...values.workDays, day];
    set('workDays', next.sort((a, b) => a - b));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormErrorKey(null);
    const found = validate(values, editing);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      const body = buildBody(values, editing);
      if (editing) await updateUser(userId, body);
      else await createUser(body);
      navigate('/doctors');
    } catch (e) {
      const result = serverErrors(e);
      setErrors(result.fields);
      setFormErrorKey(result.general);
      setSubmitting(false);
    }
  }

  /** Текст ошибки поля (в `errors` лежит i18n-ключ). */
  const errorOf = (key: keyof FormValues): string | null => (errors[key] ? t(errors[key]) : null);

  const text = (key: 'surname' | 'name' | 'specialization' | 'phone' | 'email' | 'room' | 'login' | 'password', type = 'text') => (
    <TextField
      label={t(`doctorForm.${key}`)}
      type={type}
      min={key === 'room' ? 1 : undefined}
      value={values[key]}
      error={errorOf(key)}
      hint={key === 'password' && editing ? t('doctorForm.passwordHint') : undefined}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  const timeSelect = (key: 'workStart' | 'workEnd') => (
    <FormField label={t(`doctorForm.${key}`)} error={errorOf(key)}>
      {(control) => (
        <select {...control} value={values[key]} onChange={(e) => set(key, e.target.value)}>
          {TIME_MARKS.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );

  return (
    <form noValidate onSubmit={onSubmit}>
      {me?.role === 'root' && (
        <fieldset className="form-field">
          <legend className="form-field__label">{t('doctorForm.role')}</legend>
          <div className="form-field__options">
            {(['doctor', 'admin'] as const).map((role) => (
              <label className="form-field__option" key={role}>
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={values.role === role}
                  disabled={editing}
                  onChange={() => set('role', role)}
                />
                {t(role === 'doctor' ? 'doctorForm.roleDoctor' : 'doctorForm.roleAdmin')}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {text('surname')}
      {text('name')}
      {isDoctor && text('specialization')}
      {text('phone', 'tel')}
      {text('email', 'email')}
      {isDoctor && text('room', 'number')}
      {isDoctor && (
        <fieldset className="form-field" aria-describedby={errors.workDays ? daysErrorId : undefined}>
          <legend className="form-field__label">{t('doctorForm.workDays')}</legend>
          <div className="form-field__options">
            {WEEKDAYS.map((day) => (
              <label className="form-field__option" key={day}>
                <input type="checkbox" checked={values.workDays.includes(day)} onChange={() => toggleDay(day)} />
                {t(`weekdays.${day}`)}
              </label>
            ))}
          </div>
          {errors.workDays && <FieldError id={daysErrorId}>{t(errors.workDays)}</FieldError>}
        </fieldset>
      )}
      {isDoctor && (
        <fieldset className="form-field">
          <legend className="form-field__label">{t('doctorForm.workTime')}</legend>
          {timeSelect('workStart')}
          {timeSelect('workEnd')}
        </fieldset>
      )}
      {text('login')}
      {text('password', 'password')}
      {editing && (
        <div className="form-field">
          <label className="form-field__option">
            <input type="checkbox" checked={values.deactivate} onChange={(e) => set('deactivate', e.target.checked)} />
            {t('doctorForm.deactivate')}
          </label>
        </div>
      )}
      {formErrorKey && <Message variant="error" spaced>{t(formErrorKey)}</Message>}
      <div className="doctor-form__actions">
        <button className="button button--primary" type="submit" disabled={submitting}>
          {t('common.save')}
        </button>
        <button className="button" type="button" onClick={() => navigate('/doctors')}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
