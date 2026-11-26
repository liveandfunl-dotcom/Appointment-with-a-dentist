import type { Role } from '../api/types';

/** Все, кто вошёл в систему. */
export const STAFF: Role[] = ['doctor', 'admin', 'root'];

/** Могут управлять врачами. */
export const ADMINS: Role[] = ['admin', 'root'];

export const canManageUsers = (role: Role | undefined): boolean => role !== undefined && ADMINS.includes(role);
