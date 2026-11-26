/**
 * Типы, общие для backend и frontend (docs/specs/system/api.md, раздел 2).
 * Только объявления типов, без рантайм-кода: файл стирается при компиляции и не попадает в сборки.
 */

/** Роль пользователя (api.md, 2.1). */
export type Role = 'root' | 'admin' | 'doctor';

/** Язык интерфейса и писем (api.md, раздел 1). */
export type Lang = 'ru' | 'en' | 'el';

/** Пользователь в ответах auth (`GET /api/auth/me` и др., api.md, 2.1). */
export interface AuthUser {
  id: number;
  surname: string;
  name: string;
  role: Role;
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

/** Запись на приём (api.md, 2.4). */
export interface Appointment {
  id: number;
  doctorId: number;
  date: string;
  start: string;
  end: string;
  doctor: { id: number; surname: string; name: string; room: number | null };
  patientName: string;
  patientPhone: string;
  comment: string | null;
  status: 'active' | 'cancelled';
  canCancel: boolean;
  creatorId: number;
  createDate: number;
  cancelerId: number | null;
  cancelDate: number | null;
}

/** Свободное окно врача (api.md, 4.11). */
export interface TimeWindow {
  start: string;
  end: string;
}

/** Ответ `GET /api/clinic` (api.md, 4.16). */
export interface Clinic {
  /** Часовой пояс клиники (IANA), например `Europe/Athens`. */
  timezone: string;
}
