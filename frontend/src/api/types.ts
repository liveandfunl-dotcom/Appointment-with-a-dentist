/** Типы ответов API: объявлены в `@clinic/shared` (docs/specs/system/api.md, раздел 2), здесь — точка импорта для frontend. */
import type { Appointment, AuthUser, Role, TimeWindow, UserCard, UserDetails } from '@clinic/shared';

export type { Appointment, Role, UserCard, UserDetails };

/** Ответ `GET /api/auth/me`. */
export type Me = AuthUser;

/** Свободное окно врача. */
export type FreeWindow = TimeWindow;
