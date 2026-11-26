import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { bodyOf } from '../common/validation';
import type { AuthUser } from './auth-user';
import { parseLoginRequest, parseMagicLinkRequest, parseVerifyRequest } from './auth-fields';
import { Auth, CurrentUser } from './auth.decorators';
import { AuthService, SESSION_COOKIE, SESSION_TTL_SEC } from './auth.service';
import { RateLimiter } from './rate-limiter';

/** Атрибуты cookie сессии (api.md, 4.3, 4.5). */
const SESSION_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', path: '/' } as const;

const setSessionCookie = (res: Response, token: string): void => {
  res.cookie(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_TTL_SEC * 1000 });
};
const clearSessionCookie = (res: Response): void => {
  res.cookie(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  /** api.md 4.2. Порядок: rate limit → валидация → поиск пользователя. */
  @Post('magic-link')
  @HttpCode(200)
  async magicLink(@Req() req: Request, @Body() rawBody: unknown): Promise<{ ok: true }> {
    const body = bodyOf(rawBody);
    const identifier = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    this.limiter.consume('magic-link', req.ip ?? '', identifier);

    const { email, lang } = parseMagicLinkRequest(body);

    await this.auth.requestMagicLink(email, lang);
    return { ok: true };
  }

  /** api.md 4.3. Rate limit не применяется. */
  @Post('magic-link/verify')
  @HttpCode(200)
  verify(@Body() rawBody: unknown, @Res({ passthrough: true }) res: Response): { user: AuthUser } {
    const { token } = parseVerifyRequest(bodyOf(rawBody));
    const { user, sessionToken } = this.auth.verifyMagicLink(token);
    setSessionCookie(res, sessionToken);
    return { user };
  }

  /** api.md 4.4. Порядок: rate limit → валидация → проверка пароля. */
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const body = bodyOf(rawBody);
    const identifier = typeof body.login === 'string' ? body.login.trim() : undefined;
    this.limiter.consume('login', req.ip ?? '', identifier);

    const { login, password } = parseLoginRequest(body);

    const { user, sessionToken } = await this.auth.login(login, password);
    setSessionCookie(res, sessionToken);
    return { user };
  }

  /** api.md 4.5. Идемпотентно, cookie сбрасывается всегда. */
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): { ok: true } {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token) this.auth.deleteSession(token);
    clearSessionCookie(res);
    return { ok: true };
  }

  /** api.md 4.6. */
  @Get('me')
  @Auth()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
