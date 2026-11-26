import type { Role } from '@clinic/shared';
import { checkWorkHours, collectFields, COMMON_FIELDS, ColumnValue, DOCTOR_FIELDS, parseLogin, parsePassword } from './user-fields';

/** Результат разбора тела `POST /api/users` (api.md, 4.9). Невалидные поля — в `invalid`, ничего не бросается. */
export interface CreateUserParse {
  /** `null` — недопустимая роль (тогда `invalid` начинается с `role`). */
  role: 'doctor' | 'admin' | null;
  /** Значения в формате колонок `Users`. */
  values: Record<string, ColumnValue | null>;
  /** `''` — логина нет. */
  login: string;
  /** `''` — пароль не задан; хешируется в сервисе. */
  password: string;
  invalid: string[];
}

/** Что нужно знать о цели `PATCH /api/users/:id`, чтобы проверить тело (api.md, 4.10). */
export interface UpdateTarget {
  role: Role;
  workStart: number | null;
  workEnd: number | null;
  login: string | null;
  hasPassword: boolean;
}

/** Результат разбора тела `PATCH /api/users/:id`. */
export interface UpdateUserParse {
  /** Меняемые колонки; `login: null` вместе с `pass: null` — логин очищен. */
  values: Record<string, ColumnValue | null>;
  /** Новый пароль открытым текстом (`''` — не менять); хешируется в сервисе. */
  password: string;
  invalid: string[];
}

/** Разбор тела создания. Права и уникальность проверяет сервис: у них свой порядок относительно ошибок тела. */
export function parseCreateUser(body: Record<string, unknown>): CreateUserParse {
  const invalid: string[] = [];
  const values: Record<string, ColumnValue | null> = {};
  collectFields(body, COMMON_FIELDS, false, values, invalid);

  const role = body.role === 'doctor' || body.role === 'admin' ? body.role : null;
  if (role === null) return { role, values, login: '', password: '', invalid: ['role', ...invalid] };

  if (role === 'doctor') {
    collectFields(body, DOCTOR_FIELDS, false, values, invalid);
    checkWorkHours(values.workStart, values.workEnd, invalid);
  }

  const login = body.login === undefined ? '' : parseLogin(body.login);
  const password = parsePassword(body.password);
  if (login === null) invalid.push('login');
  if (password === null) invalid.push('password');
  else if (login !== null && (login !== '') !== (password !== '')) invalid.push('password');
  return { role, values, login: login ?? '', password: password ?? '', invalid };
}

/** Разбор тела изменения с учётом текущих значений цели. */
export function parseUpdateUser(body: Record<string, unknown>, target: UpdateTarget): UpdateUserParse {
  const invalid: string[] = [];
  const values: Record<string, ColumnValue | null> = {};
  collectFields(body, COMMON_FIELDS, true, values, invalid);
  if (target.role === 'doctor') {
    collectFields(body, DOCTOR_FIELDS, true, values, invalid);
    checkWorkHours(values.workStart ?? target.workStart, values.workEnd ?? target.workEnd, invalid);
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive === 'boolean') values.isActive = body.isActive ? 1 : 0;
    else invalid.push('isActive');
  }

  const login = body.login === undefined ? undefined : parseLogin(body.login);
  const password = parsePassword(body.password);
  if (login === null) invalid.push('login');
  if (password === null) invalid.push('password');
  else if (login !== null) {
    const finalLogin = login === undefined ? target.login : login || null;
    const needsPassword = !!login && !target.hasPassword && password === '';
    if ((password !== '' && finalLogin === null) || needsPassword) invalid.push('password');
  }

  if (login !== undefined && login !== null) {
    values.login = login || null;
    if (!login) values.pass = null;
  }
  return { values, password: password ?? '', invalid };
}
