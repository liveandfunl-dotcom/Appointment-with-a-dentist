import { Inject, Injectable } from '@nestjs/common';
import { APP_OPTIONS, ResolvedAppOptions } from '../app.options';
import { Clock } from '../clock/clock.service';
import { ApiError } from '../common/api-error';
import { DbService } from '../db/db.service';
import { Lang, translate } from '../i18n/i18n';
import { MailService } from '../mail/mail.service';
import { AuthUser, roleOf } from './auth-user';
import { verifyPassword } from './password';
import { hashToken, newToken } from './tokens';

export const SESSION_COOKIE = 'session';
/** TTL magic link — 30 минут (data-model.md, 2.3). */
export const MAGIC_LINK_TTL_SEC = 1800;
/** TTL сессии — 30 дней, без продления (data-model.md, 2.4). */
export const SESSION_TTL_SEC = 2592000;

interface UserRow {
  id: number;
  surname: string;
  name: string;
  isRoot: number;
  isAdmin: number;
  isActive: number;
  email: string;
  pass: string | null;
}

const USER_COLUMNS = 'u.id, u.surname, u.name, u.isRoot, u.isAdmin, u.isActive, u.email, u.pass';

function toAuthUser(row: UserRow): AuthUser {
  return { id: row.id, surname: row.surname, name: row.name, role: roleOf(row) };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dbs: DbService,
    private readonly clock: Clock,
    private readonly mail: MailService,
    @Inject(APP_OPTIONS) private readonly options: ResolvedAppOptions,
  ) {}

  /** Создаёт magic link для активного пользователя и отправляет письмо (api.md, 4.2). */
  async requestMagicLink(email: string, lang: Lang): Promise<void> {
    const user = this.dbs.get<UserRow>(`SELECT ${USER_COLUMNS} FROM Users u WHERE u.email = ? AND u.isActive = 1`, email);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');

    const token = newToken();
    const now = this.clock.nowSec();
    this.dbs.run(
      'INSERT INTO MagicLinks (tokenHash, userId, expiresAt, usedAt, createDate) VALUES (?, ?, ?, NULL, ?)',
      hashToken(token),
      user.id,
      now + MAGIC_LINK_TTL_SEC,
      now,
    );

    const link = `${this.options.appUrl}/auth/magic?token=${token}`;
    try {
      await this.mail.send({
        to: user.email,
        subject: translate(lang, 'mail.magicLink.subject'),
        text: translate(lang, 'mail.magicLink.text', { name: user.name, link }),
      });
    } catch {
      throw new ApiError(503, 'MAIL_FAILED');
    }
  }

  /** Проверяет токен magic link, гасит его и создаёт сессию (api.md, 4.3). */
  verifyMagicLink(token: string): { user: AuthUser; sessionToken: string } {
    const row = this.dbs.get<UserRow & { linkId: number; expiresAt: number; usedAt: number | null }>(
      `SELECT m.id AS linkId, m.expiresAt, m.usedAt, ${USER_COLUMNS}
         FROM MagicLinks m JOIN Users u ON u.id = m.userId WHERE m.tokenHash = ?`,
      hashToken(token),
    );
    // «Использован» проверяется раньше «просрочен».
    if (!row || row.usedAt !== null || row.isActive !== 1) throw new ApiError(401, 'LINK_INVALID');
    const now = this.clock.nowSec();
    if (now >= row.expiresAt) throw new ApiError(401, 'LINK_EXPIRED');

    this.dbs.run('UPDATE MagicLinks SET usedAt = ? WHERE id = ?', now, row.linkId);
    return { user: toAuthUser(row), sessionToken: this.createSession(row.id) };
  }

  /** Вход по логину и паролю (api.md, 4.4). Логин сравнивается точно (регистрозависимо). */
  async login(login: string, password: string): Promise<{ user: AuthUser; sessionToken: string }> {
    const row = this.dbs.get<UserRow>(`SELECT ${USER_COLUMNS} FROM Users u WHERE u.login = ?`, login);
    if (!row || row.isActive !== 1 || !(await verifyPassword(password, row.pass))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    }
    return { user: toAuthUser(row), sessionToken: this.createSession(row.id) };
  }

  /** Пользователь действующей сессии или null. Истёкшая сессия удаляется (data-model.md, 2.4). */
  userBySession(token: string): AuthUser | null {
    const tokenHash = hashToken(token);
    const row = this.dbs.get<UserRow & { expiresAt: number }>(
      `SELECT s.expiresAt, ${USER_COLUMNS} FROM Sessions s JOIN Users u ON u.id = s.userId WHERE s.tokenHash = ?`,
      tokenHash,
    );
    if (!row) return null;
    if (this.clock.nowSec() >= row.expiresAt) {
      this.dbs.run('DELETE FROM Sessions WHERE tokenHash = ?', tokenHash);
      return null;
    }
    return row.isActive === 1 ? toAuthUser(row) : null;
  }

  /** Logout: удаляет сессию по токену, если она есть. */
  deleteSession(token: string): void {
    this.dbs.run('DELETE FROM Sessions WHERE tokenHash = ?', hashToken(token));
  }

  /** Удаляет все сессии пользователя — вызывать при деактивации (AC-AUTH-13, AC-USERS-09). */
  revokeUserSessions(userId: number): void {
    this.dbs.run('DELETE FROM Sessions WHERE userId = ?', userId);
  }

  private createSession(userId: number): string {
    const token = newToken();
    const now = this.clock.nowSec();
    this.dbs.run(
      'INSERT INTO Sessions (tokenHash, userId, expiresAt, createDate) VALUES (?, ?, ?, ?)',
      hashToken(token),
      userId,
      now + SESSION_TTL_SEC,
      now,
    );
    return token;
  }
}
