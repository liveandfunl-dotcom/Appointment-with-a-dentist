import type { UserDetails } from '../../api/types';
import { apiErrorKey } from '../../api/errors';
import { ApiError } from '../../api/client';
import { EMAIL_RE } from '../../utils/validation';

export type UserRole = 'doctor' | 'admin';

export interface FormValues {
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

/** Ошибки полей формы: значение — i18n-ключ, переводится при рендере. */
export type Errors = Partial<Record<keyof FormValues, string>>;

const PASSWORD_MIN = 8;

export function initialValues(user: UserDetails | null, role: UserRole): FormValues {
  return {
    role: user && user.role !== 'root' ? user.role : role,
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

/** Проверка формы на клиенте; пустой результат — форму можно отправлять. */
export function validate(values: FormValues, editing: boolean): Errors {
  const found: Errors = {};
  const required = 'common.requiredField';
  for (const key of ['surname', 'name', 'phone', 'email'] as const) {
    if (!values[key].trim()) found[key] = required;
  }
  if (!found.email && !EMAIL_RE.test(values.email.trim())) found.email = 'doctorForm.invalidEmail';
  if (values.role === 'doctor') {
    if (!values.specialization.trim()) found.specialization = required;
    if (!values.room.trim()) found.room = required;
    else if (!(Number.isInteger(Number(values.room)) && Number(values.room) >= 1)) found.room = 'common.invalidValue';
    if (values.workDays.length === 0) found.workDays = 'doctorForm.noDays';
    if (values.workEnd <= values.workStart) found.workEnd = 'doctorForm.endBeforeStart';
  }
  const hasLogin = values.login.trim() !== '';
  if (values.password !== '' && !hasLogin) found.password = 'doctorForm.loginRequired';
  else if (values.password.length < PASSWORD_MIN && (values.password !== '' || (!editing && hasLogin))) {
    found.password = 'doctorForm.passwordTooShort';
  }
  return found;
}

/** Тело `POST /api/users` или `PATCH /api/users/:id` (api.md, 4.9–4.10). */
export function buildBody(values: FormValues, editing: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    surname: values.surname.trim(),
    name: values.name.trim(),
    phone: values.phone.trim(),
    email: values.email.trim(),
  };
  if (values.role === 'doctor') {
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

/** Ошибка сервера → ошибки полей или общая ошибка формы (i18n-ключи). */
export function serverErrors(e: unknown): { fields: Errors; general: string | null } {
  if (e instanceof ApiError) {
    if (e.status === 409 && e.code === 'EMAIL_TAKEN') return { fields: { email: 'doctorForm.emailTaken' }, general: null };
    if (e.status === 409 && e.code === 'LOGIN_TAKEN') return { fields: { login: 'doctorForm.loginTaken' }, general: null };
    if (e.status === 400 && e.code === 'VALIDATION_ERROR' && e.fields.length > 0) {
      const fields: Errors = {};
      for (const f of e.fields) fields[f as keyof FormValues] = 'common.invalidValue';
      return { fields, general: null };
    }
  }
  return { fields: {}, general: apiErrorKey(e) };
}
