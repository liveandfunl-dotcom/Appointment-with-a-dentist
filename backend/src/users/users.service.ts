import { Injectable } from '@nestjs/common';
import type { UserCard, UserDetails } from '@clinic/shared';
import { AuthUser, roleOf } from '../auth/auth-user';
import { AuthService } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { ApiError } from '../common/api-error';
import { formatTime } from '../common/time';
import { assertValid, nullableNumber } from '../common/validation';
import { Clock } from '../clock/clock.service';
import { DbService } from '../db/db.service';
import { parseCreateUser, parseUpdateUser } from './user-input';
import { insertUser } from './insert-user';
import { parseWorkDays } from './work-days';

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

const COLUMNS =
  'id, surname, name, isRoot, isAdmin, isDoctor, login, pass, room, email, isActive, specialization, phone, workDays, workStart, workEnd';

/** Колонки, которые разрешено менять через `UPDATE` (имена подставляются в SQL). */
const UPDATABLE_COLUMNS: ReadonlySet<string> = new Set([
  'surname', 'name', 'phone', 'email',
  'specialization', 'room', 'workDays', 'workStart', 'workEnd',
  'login', 'pass', 'isActive',
]);

function toCard(row: UserRow): UserCard {
  return {
    id: row.id,
    surname: row.surname,
    name: row.name,
    role: roleOf(row),
    specialization: row.specialization,
    phone: row.phone,
    email: row.email,
    room: nullableNumber(row.room),
    workDays: parseWorkDays(row.workDays),
    workStart: row.workStart === null ? null : formatTime(row.workStart),
    workEnd: row.workEnd === null ? null : formatTime(row.workEnd),
    isActive: row.isActive === 1,
  };
}

function toDetails(row: UserRow): UserDetails {
  return { ...toCard(row), login: row.login };
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
    return this.dbs.all<UserRow>(`SELECT ${COLUMNS} FROM Users WHERE ${where} ORDER BY surname, name, id`).map(toCard);
  }

  /** api.md 4.8: admin видит только врачей, root — всех. */
  get(viewer: AuthUser, id: number): UserDetails {
    const row = this.findRow(id);
    if (viewer.role === 'admin' && roleOf(row) !== 'doctor') throw ApiError.forbidden();
    return toDetails(row);
  }

  /** api.md 4.9. Порядок: неверная роль (400) → право создавать админа (403) → поля (400) → уникальность (409). */
  async create(viewer: AuthUser, body: Record<string, unknown>): Promise<UserDetails> {
    const parsed = parseCreateUser(body);
    const { role, values } = parsed;
    if (role === null) throw ApiError.validation(parsed.invalid);
    if (role === 'admin' && viewer.role !== 'root') throw ApiError.forbidden();
    assertValid(parsed.invalid);

    const pass = parsed.password ? await hashPassword(parsed.password) : null;
    this.assertUnique(values.email as string, parsed.login || null);

    const id = insertUser(this.dbs.db, {
      name: values.name as string,
      surname: values.surname as string,
      role,
      login: parsed.login || null,
      pass,
      room: (values.room as number | undefined) ?? null,
      email: values.email as string,
      specialization: (values.specialization as string | undefined) ?? null,
      phone: values.phone as string,
      workDays: (values.workDays as string | undefined) ?? null,
      workStart: (values.workStart as number | undefined) ?? null,
      workEnd: (values.workEnd as number | undefined) ?? null,
      createDate: this.clock.nowSec(),
    });
    return toDetails(this.findRow(id));
  }

  /** api.md 4.10. Порядок: цель (404 / 403) → тело (400) → уникальность (409). */
  async update(viewer: AuthUser, id: number, body: Record<string, unknown>): Promise<UserDetails> {
    const row = this.findRow(id);
    const targetRole = roleOf(row);
    if (targetRole === 'root' || (targetRole === 'admin' && viewer.role !== 'root')) throw ApiError.forbidden();

    const parsed = parseUpdateUser(body, {
      role: targetRole,
      workStart: row.workStart,
      workEnd: row.workEnd,
      login: row.login,
      hasPassword: row.pass !== null,
    });
    assertValid(parsed.invalid);

    const values = parsed.values;
    if (parsed.password) values.pass = await hashPassword(parsed.password);
    this.assertUnique(values.email as string | undefined, (values.login as string | null | undefined) ?? null, id);

    const columns = Object.keys(values);
    const unknown = columns.find((c) => !UPDATABLE_COLUMNS.has(c));
    if (unknown) throw new Error(`UsersService.update: колонка ${unknown} не входит в UPDATABLE_COLUMNS`);
    if (columns.length > 0) {
      this.dbs.run(`UPDATE Users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...columns.map((c) => values[c]), id);
    }
    if (values.isActive === 0) this.auth.revokeUserSessions(id);
    return toDetails(this.findRow(id));
  }

  private findRow(id: number): UserRow {
    const row = this.dbs.get<UserRow>(`SELECT ${COLUMNS} FROM Users WHERE id = ?`, id);
    if (!row) throw ApiError.notFound();
    return row;
  }

  /** 409 EMAIL_TAKEN / LOGIN_TAKEN; если заняты оба — EMAIL_TAKEN (api.md, 4.9). */
  private assertUnique(email: string | undefined, login: string | null, excludeId = 0): void {
    const taken = (column: 'email' | 'login', value: string): boolean =>
      this.dbs.get(`SELECT 1 FROM Users WHERE ${column} = ? AND id <> ?`, value, excludeId) !== undefined;
    if (email !== undefined && taken('email', email)) throw new ApiError(409, 'EMAIL_TAKEN', ['email']);
    if (login !== null && taken('login', login)) throw new ApiError(409, 'LOGIN_TAKEN', ['login']);
  }
}
