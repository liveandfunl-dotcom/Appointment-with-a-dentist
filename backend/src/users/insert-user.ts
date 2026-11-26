import { DatabaseSync } from 'node:sqlite';
import type { Role } from '../auth/auth-user';

/** Значения новой строки `Users`; роль раскладывается в флаги `isAdmin / isDoctor / isRoot`. */
export interface NewUser {
  name: string;
  surname: string;
  role: Role;
  login: string | null;
  pass: string | null;
  room: number | null;
  email: string;
  specialization: string | null;
  phone: string | null;
  workDays: string | null;
  workStart: number | null;
  workEnd: number | null;
  createDate: number;
}

/** Единственное место вставки в `Users` (сиды и `UsersService.create`). Возвращает id. */
export function insertUser(db: DatabaseSync, user: NewUser): number {
  const result = db
    .prepare(
      `INSERT INTO Users (name, surname, isAdmin, isDoctor, isRoot, login, pass, room, email,
         specialization, phone, workDays, workStart, workEnd, createDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      user.name,
      user.surname,
      user.role === 'admin' ? 1 : 0,
      user.role === 'doctor' ? 1 : 0,
      user.role === 'root' ? 1 : 0,
      user.login,
      user.pass,
      user.room,
      user.email,
      user.specialization,
      user.phone,
      user.workDays,
      user.workStart,
      user.workEnd,
      user.createDate,
    );
  return Number(result.lastInsertRowid);
}
