/**
 * Данные и общие проверки для тестов страниц (records, booking, booking-form, doctors, doctor-form).
 * Форматы — docs/specs/system/api.md, разделы 2.2–2.4.
 *
 * «Сегодня» в тестах страниц — четверг 26.11.2026 10:00 (`freezeTime(new Date(2026, 10, 26, 10, 0))`).
 * Дни: 25.11 — ср, 26.11 — чт, 27.11 — пт, 28.11 — сб, 29.11 — вс, 30.11 — пн, 01.12 — вт, 02.12 — ср.
 */
import { screen } from '@testing-library/react';

import type { ApiCall } from './api-mock';

export interface UserCard {
  id: number;
  surname: string;
  name: string;
  role: 'doctor' | 'admin';
  specialization: string | null;
  phone: string;
  email: string;
  room: number | null;
  workDays: number[];
  workStart: string | null;
  workEnd: string | null;
  isActive: boolean;
}

export interface UserDetails extends UserCard {
  login: string | null;
}

/** Врач; `id: 3` совпадает с `ME.doctor`. Принимает пн–пт, 09:00–17:00. */
export const IVANOV: UserCard = {
  id: 3,
  surname: 'Иванов',
  name: 'Иван',
  role: 'doctor',
  specialization: 'Терапевт',
  phone: '+30 210 000 0001',
  email: 'doctor1@clinic.local',
  room: 101,
  workDays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '17:00',
  isActive: true,
};

/** Врач, принимает только пн, ср, пт, 10:00–18:30. */
export const PETROVA: UserCard = {
  id: 4,
  surname: 'Петрова',
  name: 'Мария',
  role: 'doctor',
  specialization: 'Хирург',
  phone: '+30 210 000 0002',
  email: 'doctor2@clinic.local',
  room: 102,
  workDays: [1, 3, 5],
  workStart: '10:00',
  workEnd: '18:30',
  isActive: true,
};

/** Деактивированный врач (его видят admin и root). */
export const SIDOROV: UserCard = {
  id: 5,
  surname: 'Сидоров',
  name: 'Пётр',
  role: 'doctor',
  specialization: 'Стоматолог-ортопед',
  phone: '+30 210 000 0003',
  email: 'doctor3@clinic.local',
  room: 103,
  workDays: [2, 4],
  workStart: '08:00',
  workEnd: '16:00',
  isActive: false,
};

/** Врач с греческими фамилией, именем и специализацией. */
export const PAPADOPOULOS: UserCard = {
  id: 6,
  surname: 'Παπαδόπουλος',
  name: 'Νίκος',
  role: 'doctor',
  specialization: 'Οδοντίατρος',
  phone: '+30 210 000 0004',
  email: 'doctor4@clinic.local',
  room: 104,
  workDays: [1, 2, 3],
  workStart: '09:00',
  workEnd: '15:00',
  isActive: true,
};

/** Администратор (в `GET /api/users` его видит только root); `id: 2` совпадает с `ME.admin`. */
export const ADMIN_CARD: UserCard = {
  id: 2,
  surname: 'Админова',
  name: 'Анна',
  role: 'admin',
  specialization: null,
  phone: '+30 210 000 0200',
  email: 'admin1@clinic.local',
  room: null,
  workDays: [],
  workStart: null,
  workEnd: null,
  isActive: true,
};

export function details(card: UserCard, login: string | null = null): UserDetails {
  return { ...card, login };
}

export interface Appointment {
  id: number;
  doctorId: number;
  date: string;
  start: string;
  end: string;
  doctor: { id: number; surname: string; name: string; room: number | null };
  patientName: string;
  patientPhone: string;
  comment: string | null;
  status: 'active' | 'cancelled';
  canCancel: boolean;
  creatorId: number;
  createDate: number;
  cancelerId: number | null;
  cancelDate: number | null;
}

/** Запись к врачу `doctor` (по умолчанию активная, отменить можно). */
export function appointment(
  id: number,
  doctor: UserCard,
  over: Partial<Appointment> = {},
): Appointment {
  return {
    id,
    doctorId: doctor.id,
    date: '2026-11-27',
    start: '09:00',
    end: '10:30',
    doctor: { id: doctor.id, surname: doctor.surname, name: doctor.name, room: doctor.room },
    patientName: 'Мария Кузнецова',
    patientPhone: '+30 690 000 0000',
    comment: null,
    status: 'active',
    canCancel: true,
    creatorId: 2,
    createDate: 1795689000,
    cancelerId: null,
    cancelDate: null,
    ...over,
  };
}

/** Тело запроса как объект (падает с понятной ошибкой, если вызова не было). */
export function bodyOf(call: ApiCall | undefined): Record<string, unknown> {
  if (!call) throw new Error('ожидался запрос к API, но его не было');
  return call.body as Record<string, unknown>;
}

/** Тексты `<option>` внутри select. */
export function optionTexts(select: HTMLElement): string[] {
  return Array.from((select as HTMLSelectElement).options).map((o) => o.textContent ?? '');
}

/**
 * Текст ошибки поля (screens.md, 1.1): поле aria-invalid="true", а его aria-describedby указывает на
 * элемент role="alert" с этим текстом (подходит и при нескольких одинаковых ошибках на странице).
 */
export function expectFieldError(field: HTMLElement, text: string) {
  expect(field).toHaveAttribute('aria-invalid', 'true');
  const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  const alerts = screen.getAllByRole('alert');
  const matching = ids
    .map((id) => alerts.find((a) => a.id === id))
    .filter((a): a is HTMLElement => a !== undefined && a.textContent?.trim() === text);
  expect(matching).toHaveLength(1);
}

/** Тексты всех элементов role="alert" на странице. */
export function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((a) => a.textContent?.trim() ?? '');
}
