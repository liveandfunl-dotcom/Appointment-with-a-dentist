import type { AuthUser, Role } from '@clinic/shared';

export type { AuthUser, Role };

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
