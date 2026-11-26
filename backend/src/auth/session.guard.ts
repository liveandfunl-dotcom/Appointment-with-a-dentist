import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/api-error';
import type { Role } from './auth-user';
import { AuthedRequest, ROLES_KEY } from './auth.decorators';
import { AuthService, SESSION_COOKIE } from './auth.service';

/** Глобальный guard: разбирает cookie `session` в `req.user` и проверяет `@Roles()` / `@Auth()`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    req.user = typeof token === 'string' && token ? (this.auth.userBySession(token) ?? undefined) : undefined;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles) return true;
    if (!req.user) throw ApiError.unauthorized();
    if (roles.length > 0 && !roles.includes(req.user.role)) throw ApiError.forbidden();
    return true;
  }
}
