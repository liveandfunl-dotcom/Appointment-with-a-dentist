import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, Role } from './auth-user';

export const ROLES_KEY = 'auth:roles';

/** Запрос, к которому SessionGuard приложил текущего пользователя (если cookie действительна). */
export type AuthedRequest = Request & { user?: AuthUser };

/**
 * Доступ только вошедшим пользователям с одной из ролей; без аргументов — любой вошедший.
 * Нет сессии → 401 UNAUTHORIZED, роль не подходит → 403 FORBIDDEN.
 * Маршруты без декоратора публичные; пользователь всё равно доступен через `@CurrentUser()`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Любой вошедший пользователь (уровень доступа `auth`). */
export const Auth = () => Roles();

/** Текущий пользователь (`AuthUser`) или `undefined` на публичном маршруте без сессии. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
