import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import './doctor-form.css';

type UserRole = 'doctor' | 'admin';

interface UserDetails {
  id: number;
  surname: string;
  name: string;
  role: UserRole;
  specialization: string | null;
  phone: string;
  email: string;
  room: number | null;
  workDays: number[];
  workStart: string | null;
  workEnd: string | null;
  isActive: boolean;
  login: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
/** 00:00, 00:30 … 24:00. */
const TIMES = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

interface FormValues {
  role: UserRole;
  surname: string;
  name: string;
  specialization: string;
  phone: string;
  email: string;
  room: string;
  workDays: number[];
  workStart: string;
  workEnd: string;
  login: string;
  password: string;
  deactivate: boolean;
}

type Errors = Partial<Record<string, string>>;

function initialValues(user: UserDetails | null, role: UserRole): FormValues {
  return {
    role: user?.role ?? role,
    surname: user?.surname ?? '',
    name: user?.name ?? '',
    specialization: user?.specialization ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    room: user?.room != null ? String(user.room) : '',
    workDays: user?.workDays ?? [],
    workStart: user?.workStart ?? '09:00',
    workEnd: user?.workEnd ?? '17:00',
    login: user?.login ?? '',
    password: '',
    deactivate: user ? !user.isActive : false,
  };
}

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
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'notFound' | 'error'; user: UserDetails | null }>({
    status: 'loading',
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get<UserDetails>(`/api/users/${id}`)
      .then((user) => {
        if (!cancelled) setState({ status: 'ready', user });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: e instanceof ApiError && e.status === 404 ? 'notFound' : 'error', user: null });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') return <p className="doctor-form__status">{t('common.loading')}</p>;
  if (state.status === 'notFound') return <p className="doctor-form__error">{t('doctorForm.notFound')}</p>;
  if (state.status === 'error') {
    return (
      <p className="doctor-form__error" role="alert">
        {t('common.genericError')}
      </p>
    );
  }
  return <DoctorForm userId={id} user={state.user} />;
}

function DoctorForm({ userId, user }: { userId: string | undefined; user: UserDetails | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const editing = userId !== undefined;
  const [values, setValues] = useState<FormValues>(() => initialValues(user, 'doctor'));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
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

  function validate(): Errors {
    const found: Errors = {};
    const required = t('common.requiredField');
    for (const key of ['surname', 'name', 'phone', 'email'] as const) {
      if (!values[key].trim()) found[key] = required;
    }
    if (!found.email && !EMAIL_RE.test(values.email.trim())) found.email = t('doctorForm.invalidEmail');
    if (isDoctor) {
      if (!values.specialization.trim()) found.specialization = required;
      if (!values.room.trim()) found.room = required;
      else if (!(Number.isInteger(Number(values.room)) && Number(values.room) >= 1)) {
        found.room = t('common.invalidValue');
      }
      if (values.workDays.length === 0) found.workDays = t('doctorForm.noDays');
      if (values.workEnd <= values.workStart) found.workEnd = t('doctorForm.endBeforeStart');
    }
    const hasLogin = values.login.trim() !== '';
    if (values.password !== '' && !hasLogin) found.password = t('doctorForm.loginRequired');
    else if (values.password.length < 8 && (values.password !== '' || (!editing && hasLogin))) {
      found.password = t('doctorForm.passwordTooShort');
    }
    return found;
  }

  function buildBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      surname: values.surname.trim(),
      name: values.name.trim(),
      phone: values.phone.trim(),
      email: values.email.trim(),
    };
    if (isDoctor) {
      body.specialization = values.specialization.trim();
      body.room = Number(values.room);
      body.workDays = values.workDays;
      body.workStart = values.workStart;
      body.workEnd = values.workEnd;
    }
    const login = values.login.trim();
    if (editing) {
      body.login = login;
      body.isActive = !values.deactivate;
    } else {
      body.role = values.role;
      if (login) body.login = login;
    }
    if (values.password) body.password = values.password;
    return body;
  }

  function serverErrors(e: unknown): { fields: Errors; general: string | null } {
    if (e instanceof ApiError) {
      if (e.status === 409 && e.code === 'EMAIL_TAKEN') return { fields: { email: t('doctorForm.emailTaken') }, general: null };
      if (e.status === 409 && e.code === 'LOGIN_TAKEN') return { fields: { login: t('doctorForm.loginTaken') }, general: null };
      if (e.status === 400 && e.code === 'VALIDATION_ERROR' && e.fields.length > 0) {
        const fields: Errors = {};
        for (const f of e.fields) fields[f] = t('common.invalidValue');
        return { fields, general: null };
      }
      if (e.code === 'TOO_MANY_REQUESTS') return { fields: {}, general: t('common.tooManyRequests') };
    }
    return { fields: {}, general: t('common.genericError') };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      if (editing) await api.patch(`/api/users/${userId}`, buildBody());
      else await api.post('/api/users', buildBody());
      navigate('/doctors');
    } catch (e) {
      const result = serverErrors(e);
      setErrors(result.fields);
      setFormError(result.general);
      setSubmitting(false);
    }
  }

  /** Атрибуты поля с ошибкой (aria-invalid и ссылка на элемент role="alert"). */
  const fieldProps = (key: string, extraDescribedBy?: string) => {
    const describedBy = [errors[key] ? `doctor-form-${key}-error` : null, extraDescribedBy].filter(Boolean).join(' ');
    return {
      id: `doctor-form-${key}`,
      'aria-invalid': errors[key] ? (true as const) : undefined,
      'aria-describedby': describedBy || undefined,
    };
  };
  const errorOf = (key: string) =>
    errors[key] ? (
      <p className="form-field__error" id={`doctor-form-${key}-error`} role="alert">
        {errors[key]}
      </p>
    ) : null;

  function textField(key: 'surname' | 'name' | 'specialization' | 'phone' | 'email' | 'room' | 'login' | 'password', labelKey: string, type = 'text') {
    const hint = key === 'password' && editing;
    return (
      <div className="form-field">
        <label className="form-field__label" htmlFor={`doctor-form-${key}`}>
          {t(labelKey)}
        </label>
        <input
          {...fieldProps(key, hint ? 'doctor-form-password-hint' : undefined)}
          type={type}
          min={key === 'room' ? 1 : undefined}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
        />
        {hint && (
          <p className="form-field__hint" id="doctor-form-password-hint">
            {t('doctorForm.passwordHint')}
          </p>
        )}
        {errorOf(key)}
      </div>
    );
  }

  function timeSelect(key: 'workStart' | 'workEnd', labelKey: string) {
    return (
      <div className="form-field">
        <label className="form-field__label" htmlFor={`doctor-form-${key}`}>
          {t(labelKey)}
        </label>
        <select {...fieldProps(key)} value={values[key]} onChange={(e) => set(key, e.target.value)}>
          {TIMES.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
        {errorOf(key)}
      </div>
    );
  }

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
      {textField('surname', 'doctorForm.surname')}
      {textField('name', 'doctorForm.name')}
      {isDoctor && textField('specialization', 'doctorForm.specialization')}
      {textField('phone', 'doctorForm.phone', 'tel')}
      {textField('email', 'doctorForm.email', 'email')}
      {isDoctor && textField('room', 'doctorForm.room', 'number')}
      {isDoctor && (
        <fieldset className="form-field" aria-describedby={errors.workDays ? 'doctor-form-workDays-error' : undefined}>
          <legend className="form-field__label">{t('doctorForm.workDays')}</legend>
          <div className="form-field__options">
            {WEEKDAYS.map((day) => (
              <label className="form-field__option" key={day}>
                <input type="checkbox" checked={values.workDays.includes(day)} onChange={() => toggleDay(day)} />
                {t(`weekdays.${day}`)}
              </label>
            ))}
          </div>
          {errorOf('workDays')}
        </fieldset>
      )}
      {isDoctor && (
        <fieldset className="form-field">
          <legend className="form-field__label">{t('doctorForm.workTime')}</legend>
          {timeSelect('workStart', 'doctorForm.workStart')}
          {timeSelect('workEnd', 'doctorForm.workEnd')}
        </fieldset>
      )}
      {textField('login', 'doctorForm.login')}
      {textField('password', 'doctorForm.password', 'password')}
      {editing && (
        <div className="form-field">
          <label className="form-field__option">
            <input type="checkbox" checked={values.deactivate} onChange={(e) => set('deactivate', e.target.checked)} />
            {t('doctorForm.deactivate')}
          </label>
        </div>
      )}
      {formError && (
        <p className="doctor-form__error" role="alert">
          {formError}
        </p>
      )}
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
