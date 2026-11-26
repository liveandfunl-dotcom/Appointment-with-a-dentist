import { Injectable } from '@nestjs/common';
import { AuthUser, Role, roleOf } from '../auth/auth-user';
import { AuthService } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { ApiError } from '../common/api-error';
import { formatTime } from '../common/time';
import { assertValid } from '../common/validation';
import { Clock } from '../clock/clock.service';
import { DbService } from '../db/db.service';
import {
  checkWorkHours,
  collectFields,
  COMMON_FIELDS,
  ColumnValue,
  DOCTOR_FIELDS,
  parseLogin,
  parsePassword,
} from './user-fields';

interface UserRow {
  id: number;
  surname: string;
  name: string;
  isRoot: number;
  isAdmin: number;
  isDoctor: number;
  login: string | null;
  pass: string | null;
  room: number | null;
  email: string;
  isActive: number;
  specialization: string | null;
  phone: string | null;
  workDays: string | null;
  workStart: number | null;
  workEnd: number | null;
}

/** Элемент `GET /api/users` (api.md, 2.2). */
export interface UserCard {
  id: number;
  surname: string;
  name: string;
  role: Role;
  specialization: string | null;
  phone: string | null;
  email: string;
  room: number | null;
  workDays: number[];
  workStart: string | null;
  workEnd: string | null;
  isActive: boolean;
}

/** `UserCard` + login (api.md, 2.3). Пароль не отдаётся никогда. */
export interface UserDetails extends UserCard {
  login: string | null;
}

const COLUMNS =
  'id, surname, name, isRoot, isAdmin, isDoctor, login, pass, room, email, isActive, specialization, phone, workDays, workStart, workEnd';

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function toCard(row: UserRow): UserCard {
  return {
    id: Number(row.id),
    surname: row.surname,
    name: row.name,
    role: roleOf(row),
    specialization: row.specialization,
    phone: row.phone,
    email: row.email,
    room: nullableNumber(row.room),
    workDays: row.workDays ? row.workDays.split(',').map(Number) : [],
    workStart: row.workStart === null ? null : formatTime(Number(row.workStart)),
    workEnd: row.workEnd === null ? null : formatTime(Number(row.workEnd)),
    isActive: Number(row.isActive) === 1,
  };
}

function toDetails(row: UserRow): UserDetails {
  return { ...toCard(row), login: row.login };
}

/** id в пути: целое ≥ 1, иначе 404 NOT_FOUND (api.md, 1.4). */
export function parseId(raw: string): number {
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) throw ApiError.notFound();
  return id;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly dbs: DbService,
    private readonly clock: Clock,
    private readonly auth: AuthService,
  ) {}

  /** api.md 4.7: состав зависит от роли; root не показывается никому. */
  list(viewer: AuthUser | undefined): UserCard[] {
    const where =
      viewer?.role === 'root'
        ? 'isDoctor = 1 OR isAdmin = 1'
        : viewer?.role === 'admin'
          ? 'isDoctor = 1'
          : 'isDoctor = 1 AND isActive = 1';
    const rows = this.dbs.db
      .prepare(`SELECT ${COLUMNS} FROM Users WHERE ${where} ORDER BY surname, name, id`)
      .all() as unknown as UserRow[];
    return rows.map(toCard);
  }

  /** api.md 4.8: admin видит только врачей, root — всех. */
  get(viewer: AuthUser, id: number): UserDetails {
    const row = this.findRow(id);
    if (viewer.role === 'admin' && roleOf(row) !== 'doctor') throw ApiError.forbidden();
    return toDetails(row);
  }

  /** api.md 4.9. */
  async create(viewer: AuthUser, body: Record<string, unknown>): Promise<UserDetails> {
    const role = body.role;
    const invalid: string[] = [];
    const values: Record<string, ColumnValue | null> = {};
    if (role !== 'doctor' && role !== 'admin') {
      collectFields(body, COMMON_FIELDS, false, values, invalid);
      assertValid(['role', ...invalid]);
    }
    // Для admin роль создаваемого проверяется до остальных полей.
    if (role === 'admin' && viewer.role !== 'root') throw ApiError.forbidden();

    collectFields(body, COMMON_FIELDS, false, values, invalid);
    if (role === 'doctor') {
      collectFields(body, DOCTOR_FIELDS, false, values, invalid);
      checkWorkHours(values.workStart, values.workEnd, invalid);
    }

    const login = body.login === undefined ? '' : parseLogin(body.login);
    const password = parsePassword(body.password);
    if (login === null) invalid.push('login');
    if (password === null) invalid.push('password');
    else if (login !== null && (login !== '') !== (password !== '')) invalid.push('password');
    assertValid(invalid);

    const pass = password ? await hashPassword(password) : null;
    this.assertUnique(values.email as string, login || null);

    const result = this.dbs.db
      .prepare(
        `INSERT INTO Users (name, surname, isAdmin, isDoctor, isRoot, login, pass, room, email,
           specialization, phone, workDays, workStart, workEnd, createDate)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        values.name,
        values.surname,
        role === 'admin' ? 1 : 0,
        role === 'doctor' ? 1 : 0,
        login || null,
        pass,
        values.room ?? null,
        values.email,
        values.specialization ?? null,
        values.phone,
        values.workDays ?? null,
        values.workStart ?? null,
        values.workEnd ?? null,
        this.clock.nowSec(),
      );
    return toDetails(this.findRow(Number(result.lastInsertRowid)));
  }

  /** api.md 4.10. Цель проверяется до тела. */
  async update(viewer: AuthUser, id: number, body: Record<string, unknown>): Promise<UserDetails> {
    const row = this.findRow(id);
    const targetRole = roleOf(row);
    if (targetRole === 'root' || (targetRole === 'admin' && viewer.role !== 'root')) throw ApiError.forbidden();

    const invalid: string[] = [];
    const values: Record<string, ColumnValue | null> = {};
    collectFields(body, COMMON_FIELDS, true, values, invalid);
    if (targetRole === 'doctor') {
      collectFields(body, DOCTOR_FIELDS, true, values, invalid);
      checkWorkHours(values.workStart ?? row.workStart, values.workEnd ?? row.workEnd, invalid);
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
      const finalLogin = login === undefined ? row.login : login || null;
      const needsPassword = !!login && row.pass === null && password === '';
      if ((password !== '' && finalLogin === null) || needsPassword) invalid.push('password');
    }
    assertValid(invalid);

    if (login !== undefined && login !== null) {
      values.login = login || null;
      if (!login) values.pass = null;
    }
    if (password) values.pass = await hashPassword(password);

    this.assertUnique(values.email as string | undefined, (values.login as string | null | undefined) ?? null, id);

    const columns = Object.keys(values);
    if (columns.length > 0) {
      this.dbs.db
        .prepare(`UPDATE Users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...columns.map((c) => values[c]), id);
    }
    if (values.isActive === 0) this.auth.revokeUserSessions(id);
    return toDetails(this.findRow(id));
  }

  private findRow(id: number): UserRow {
    const row = this.dbs.db.prepare(`SELECT ${COLUMNS} FROM Users WHERE id = ?`).get(id) as UserRow | undefined;
    if (!row) throw ApiError.notFound();
    return row;
  }

  /** 409 EMAIL_TAKEN / LOGIN_TAKEN; если заняты оба — EMAIL_TAKEN (api.md, 4.9). */
  private assertUnique(email: string | undefined, login: string | null, excludeId = 0): void {
    const taken = (column: 'email' | 'login', value: string): boolean =>
      this.dbs.db.prepare(`SELECT 1 FROM Users WHERE ${column} = ? AND id <> ?`).get(value, excludeId) !== undefined;
    if (email !== undefined && taken('email', email)) throw new ApiError(409, 'EMAIL_TAKEN', ['email']);
    if (login !== null && taken('login', login)) throw new ApiError(409, 'LOGIN_TAKEN', ['login']);
  }
}
