export type Role = 'root' | 'admin' | 'doctor';

/** Пользователь в ответах auth и в `@CurrentUser()` (api.md, 2.1). */
export interface AuthUser {
  id: number;
  surname: string;
  name: string;
  role: Role;
}

interface RoleFlags {
  isRoot: number | bigint;
  isAdmin: number | bigint;
}

/** Роль по флагам строки Users (data-model.md, 2.1). */
export function roleOf(row: RoleFlags): Role {
  if (Number(row.isRoot) === 1) return 'root';
  if (Number(row.isAdmin) === 1) return 'admin';
  return 'doctor';
}
