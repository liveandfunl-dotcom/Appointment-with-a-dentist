import { DatabaseSync } from 'node:sqlite';
import type { Role } from '../auth/auth-user';
import { hashPassword } from '../auth/password';
import { toUnixSec } from '../common/time';
import { insertUser } from '../users/insert-user';

/** Данные пользователя для сида (data-model.md, раздел 4). */
interface SeedUser {
  email: string;
  login: string;
  password: string;
  surname: string;
  name: string;
  role: Role;
  phone: string | null;
  specialization?: string;
  room?: number;
  workDays?: string;
  workStart?: number;
  workEnd?: number;
}

const ROOT: SeedUser = {
  email: 'root@clinic.local',
  login: 'root',
  password: 'root1234',
  surname: 'Root',
  name: 'System',
  role: 'root',
  phone: null,
};

const DOCTOR_PASSWORD = 'doctor1234';

const DEV_USERS: SeedUser[] = [
  {
    email: 'doctor1@clinic.local', login: 'doctor1', password: DOCTOR_PASSWORD, surname: 'Иванов', name: 'Иван',
    role: 'doctor', specialization: 'Терапевт', room: 101, phone: '+30 210 000 0001',
    workDays: '1,2,3,4,5', workStart: 540, workEnd: 1020,
  },
  {
    email: 'doctor2@clinic.local', login: 'doctor2', password: DOCTOR_PASSWORD, surname: 'Петрова', name: 'Анна',
    role: 'doctor', specialization: 'Хирург', room: 102, phone: '+30 210 000 0002',
    workDays: '1,3,5', workStart: 480, workEnd: 840,
  },
  {
    email: 'doctor3@clinic.local', login: 'doctor3', password: DOCTOR_PASSWORD, surname: 'Παπαδόπουλος', name: 'Γιώργος',
    role: 'doctor', specialization: 'Ορθοδοντικός', room: 103, phone: '+30 210 000 0003',
    workDays: '2,4,6', workStart: 720, workEnd: 1200,
  },
  {
    email: 'doctor4@clinic.local', login: 'doctor4', password: DOCTOR_PASSWORD, surname: 'Smith', name: 'John',
    role: 'doctor', specialization: 'Orthopedist', room: 104, phone: '+30 210 000 0004',
    workDays: '1,2,3,4,5,6', workStart: 600, workEnd: 1080,
  },
  {
    email: 'doctor5@clinic.local', login: 'doctor5', password: DOCTOR_PASSWORD, surname: 'Νικολάου', name: 'Μαρία',
    role: 'doctor', specialization: 'Детский стоматолог', room: 105, phone: '+30 210 000 0005',
    workDays: '1,2,3,4,5,6,7', workStart: 480, workEnd: 1200,
  },
  {
    email: 'admin@clinic.local', login: 'admin', password: 'admin1234', surname: 'Админова', name: 'Елена',
    role: 'admin', phone: '+30 210 000 0100',
  },
];

async function seedUser(db: DatabaseSync, user: SeedUser, nowSec: number): Promise<void> {
  const exists = db.prepare('SELECT 1 FROM Users WHERE email = ?').get(user.email);
  if (exists) return;
  insertUser(db, {
    name: user.name,
    surname: user.surname,
    role: user.role,
    login: user.login,
    pass: await hashPassword(user.password),
    room: user.room ?? null,
    email: user.email,
    specialization: user.specialization ?? null,
    phone: user.phone,
    workDays: user.workDays ?? null,
    workStart: user.workStart ?? null,
    workEnd: user.workEnd ?? null,
    createDate: nowSec,
  });
}

/** Сиды (data-model.md, раздел 4): root всегда, dev-пользователи при seedDev. Идемпотентно по email. */
export async function runSeeds(db: DatabaseSync, now: () => Date, seedDev: boolean): Promise<void> {
  const users = seedDev ? [ROOT, ...DEV_USERS] : [ROOT];
  for (const user of users) {
    await seedUser(db, user, toUnixSec(now()));
  }
}
