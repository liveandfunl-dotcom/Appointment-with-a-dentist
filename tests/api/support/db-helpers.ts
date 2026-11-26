// Вспомогательные функции для tests/api/db.spec.ts (AC-DB-01…04).
// Контракт — docs/specs/design/data-model.md.
import type { INestApplication } from '@nestjs/common';
import { scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../../../backend/src/app.factory';

/** Фиксированные часы для тестов: момент первого старта и момент перезапуска. */
export const FIRST_START = new Date('2026-03-02T08:00:00Z');
export const SECOND_START = new Date('2026-03-05T12:30:00Z');

export const toUnixSec = (d: Date): number => Math.floor(d.getTime() / 1000);

/** Таблицы и индексы из DDL миграции 1 (data-model.md, раздел 2). */
export const EXPECTED_TABLES = ['Appointments', 'MagicLinks', 'Sessions', 'Users', 'schema_migrations'];
export const EXPECTED_INDEXES = [
  'idx_appointments_date',
  'idx_appointments_doctor_date',
  'idx_magiclinks_user',
  'idx_sessions_user',
  'idx_users_name',
  'idx_users_surname',
];

/** Формат хеша пароля (data-model.md, 2.5): scrypt$<saltHex 32>$<hashHex 128>. */
export const PASS_HASH_RE = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/i;

export interface UserRow {
  id: number;
  name: string;
  surname: string;
  isAdmin: number;
  isDoctor: number;
  isRoot: number;
  login: string | null;
  pass: string | null;
  room: number | null;
  email: string;
  isActive: number;
  specialization: string | null;
  phone: string | null;
  workDays: string | null;
  workStart: number | null;
  workEnd: number | null;
  createDate: number;
}

export interface SchemaMigrationRow {
  version: number;
  name: string;
  appliedAt: number;
}

/** Типы модулей backend/src/db/migrations.ts и migrator.ts (data-model.md, раздел 3). */
export interface Migration {
  version: number;
  name: string;
  up: string;
}
export interface MigrationsModule {
  MIGRATIONS: Migration[];
}
export interface MigratorModule {
  runMigrations(db: DatabaseSync, migrations: Migration[], now: () => Date): void;
}

/** Сид root (data-model.md, 4.1). */
export const ROOT_SEED = {
  surname: 'Root',
  name: 'System',
  login: 'root',
  password: 'root1234',
  email: 'root@clinic.local',
} as const;

/** Dev-сид врачей (data-model.md, 4.2). */
export const DEV_DOCTORS = [
  {
    email: 'doctor1@clinic.local', login: 'doctor1', surname: 'Иванов', name: 'Иван',
    specialization: 'Терапевт', room: 101, phone: '+30 210 000 0001',
    workDays: '1,2,3,4,5', workStart: 540, workEnd: 1020,
  },
  {
    email: 'doctor2@clinic.local', login: 'doctor2', surname: 'Петрова', name: 'Анна',
    specialization: 'Хирург', room: 102, phone: '+30 210 000 0002',
    workDays: '1,3,5', workStart: 480, workEnd: 840,
  },
  {
    email: 'doctor3@clinic.local', login: 'doctor3', surname: 'Παπαδόπουλος', name: 'Γιώργος',
    specialization: 'Ορθοδοντικός', room: 103, phone: '+30 210 000 0003',
    workDays: '2,4,6', workStart: 720, workEnd: 1200,
  },
  {
    email: 'doctor4@clinic.local', login: 'doctor4', surname: 'Smith', name: 'John',
    specialization: 'Orthopedist', room: 104, phone: '+30 210 000 0004',
    workDays: '1,2,3,4,5,6', workStart: 600, workEnd: 1080,
  },
  {
    email: 'doctor5@clinic.local', login: 'doctor5', surname: 'Νικολάου', name: 'Μαρία',
    specialization: 'Детский стоматолог', room: 105, phone: '+30 210 000 0005',
    workDays: '1,2,3,4,5,6,7', workStart: 480, workEnd: 1200,
  },
] as const;
export const DEV_DOCTOR_PASSWORD = 'doctor1234';

/** Dev-сид администратора (data-model.md, 4.2). */
export const DEV_ADMIN = {
  email: 'admin@clinic.local',
  login: 'admin',
  password: 'admin1234',
  surname: 'Админова',
  name: 'Елена',
  phone: '+30 210 000 0100',
} as const;

/** Временный каталог с путём к файлу БД; cleanup() удаляет каталог. */
export interface TempDb {
  dir: string;
  dbPath: string;
  cleanup(): void;
}

export function makeTempDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), 'clinic-db-'));
  return {
    dir,
    dbPath: join(dir, 'clinic.db'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export interface StartOptions {
  seedDev?: boolean;
  now?: Date;
}

/** createApp на dbPath с фиксированными часами. */
export function startApp(dbPath: string, opts: StartOptions = {}): Promise<INestApplication> {
  const at = opts.now ?? FIRST_START;
  return createApp({ dbPath, mail: 'memory', seedDev: opts.seedDev ?? false, now: () => at });
}

/** Старт и сразу закрытие приложения (выполняются миграции и сиды, БД освобождается). */
export async function startAndClose(dbPath: string, opts: StartOptions = {}): Promise<void> {
  const app = await startApp(dbPath, opts);
  await app.close();
}

/** Открывает файл БД напрямую, выполняет fn и закрывает соединение. */
export function withDb<T>(dbPath: string, fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function listTables(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => String(r.name));
}

export function listIndexes(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => String(r.name));
}

export function listColumns(db: DatabaseSync, table: string): string[] {
  return db
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all()
    .map((r) => String(r.name));
}

export function readUsers(db: DatabaseSync): UserRow[] {
  return db.prepare('SELECT * FROM Users ORDER BY id').all() as unknown as UserRow[];
}

export function readMigrations(db: DatabaseSync): SchemaMigrationRow[] {
  return db
    .prepare('SELECT version, name, appliedAt FROM schema_migrations ORDER BY version')
    .all() as unknown as SchemaMigrationRow[];
}

/** Проверка пароля по формату 2.5: пересчёт scrypt с солью из строки (соль — байты из saltHex). */
export function scryptMatches(stored: string, password: string): boolean {
  const m = PASS_HASH_RE.exec(stored);
  if (!m) return false;
  const [, saltHex, hashHex] = m;
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return hash.toString('hex') === hashHex.toLowerCase();
}
