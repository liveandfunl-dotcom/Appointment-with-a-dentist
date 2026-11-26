// Пользователи dev-сида (docs/specs/design/data-model.md, раздел 4). Создаются backend'ом при SEED_DEV=true.

export interface SeedUser {
  login: string;
  password: string;
  email: string;
  surname: string;
  name: string;
}

export interface SeedDoctor extends SeedUser {
  specialization: string;
  room: number;
  phone: string;
  workDays: readonly number[];
  workStart: string;
  workEnd: string;
}

export const ROOT: SeedUser = {
  login: 'root',
  password: 'root1234',
  email: 'root@clinic.local',
  surname: 'Root',
  name: 'System',
};

export const ADMIN: SeedUser & { phone: string } = {
  login: 'admin',
  password: 'admin1234',
  email: 'admin@clinic.local',
  surname: 'Админова',
  name: 'Елена',
  phone: '+30 210 000 0100',
};

function doctor(n: number, d: Omit<SeedDoctor, 'login' | 'password' | 'email'>): SeedDoctor {
  return { login: `doctor${n}`, password: 'doctor1234', email: `doctor${n}@clinic.local`, ...d };
}

export const DOCTOR1 = doctor(1, {
  surname: 'Иванов',
  name: 'Иван',
  specialization: 'Терапевт',
  room: 101,
  phone: '+30 210 000 0001',
  workDays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '17:00',
});

export const DOCTOR2 = doctor(2, {
  surname: 'Петрова',
  name: 'Анна',
  specialization: 'Хирург',
  room: 102,
  phone: '+30 210 000 0002',
  workDays: [1, 3, 5],
  workStart: '08:00',
  workEnd: '14:00',
});

export const DOCTOR3 = doctor(3, {
  surname: 'Παπαδόπουλος',
  name: 'Γιώργος',
  specialization: 'Ορθοδοντικός',
  room: 103,
  phone: '+30 210 000 0003',
  workDays: [2, 4, 6],
  workStart: '12:00',
  workEnd: '20:00',
});

export const DOCTOR4 = doctor(4, {
  surname: 'Smith',
  name: 'John',
  specialization: 'Orthopedist',
  room: 104,
  phone: '+30 210 000 0004',
  workDays: [1, 2, 3, 4, 5, 6],
  workStart: '10:00',
  workEnd: '18:00',
});

/** Принимает каждый день 08:00–20:00 — на него e2e записывают на любую будущую дату. */
export const DOCTOR5 = doctor(5, {
  surname: 'Νικολάου',
  name: 'Μαρία',
  specialization: 'Детский стоматолог',
  room: 105,
  phone: '+30 210 000 0005',
  workDays: [1, 2, 3, 4, 5, 6, 7],
  workStart: '08:00',
  workEnd: '20:00',
});

export const SEED_DOCTORS = [DOCTOR1, DOCTOR2, DOCTOR3, DOCTOR4, DOCTOR5] as const;

/** «Фамилия Имя» — как в списках врачей, таблице записей и карточках. */
export function fullName(u: { surname: string; name: string }): string {
  return `${u.surname} ${u.name}`;
}
