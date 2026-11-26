import { randomBytes, scrypt, ScryptOptions, timingSafeEqual } from 'node:crypto';

/** Параметры хеша пароля (data-model.md, 2.5). */
const KEYLEN = 64;
const SALT_BYTES = 16;
const OPTIONS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const STORED_RE = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/i;

function derive(plain: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, KEYLEN, OPTIONS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Хеш в формате `scrypt$<saltHex>$<hashHex>`. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(plain, salt);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Проверка пароля пересчётом scrypt с солью из stored; false для неверного формата. */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  const m = stored ? STORED_RE.exec(stored) : null;
  if (!m) return false;
  const expected = Buffer.from(m[2], 'hex');
  const actual = await derive(plain, Buffer.from(m[1], 'hex'));
  return timingSafeEqual(actual, expected);
}
