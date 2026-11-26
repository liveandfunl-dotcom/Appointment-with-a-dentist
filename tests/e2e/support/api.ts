import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { uid } from './env';

// Подготовка данных теста через API backend'а (контракт — docs/specs/system/api.md).
// UI в этих шагах не проверяется: так тесты не зависят друг от друга и от порядка запуска.

export interface UserDetails {
  id: number;
  role: 'root' | 'admin' | 'doctor';
  surname: string;
  name: string;
  specialization: string | null;
  phone: string;
  email: string;
  room: number | null;
  workDays: number[];
  workStart: string | null;
  workEnd: string | null;
  isActive: boolean;
  login: string | null;
}

export interface Appointment {
  id: number;
  doctorId: number;
  date: string;
  start: string;
  end: string;
  patientName: string;
  patientPhone: string;
  status: 'active' | 'cancelled';
  canCancel: boolean;
}

export interface NewDoctor {
  surname: string;
  name: string;
  phone: string;
  email: string;
  specialization: string;
  room: number;
  workDays: number[];
  workStart: string;
  workEnd: string;
  login?: string;
  password?: string;
}

/** Данные нового врача с уникальными фамилией, email и логином. */
export function newDoctorData(overrides: Partial<NewDoctor> = {}): NewDoctor {
  const id = uid();
  return {
    surname: `Тестов${id}`,
    name: 'Пётр',
    phone: '+30 210 555 0000',
    email: `e2e.${id}@clinic.local`,
    specialization: 'Пародонтолог',
    room: 201,
    workDays: [1, 2, 3, 4, 5, 6, 7],
    workStart: '09:00',
    workEnd: '17:00',
    ...overrides,
  };
}

export async function createDoctor(api: APIRequestContext, overrides: Partial<NewDoctor> = {}): Promise<UserDetails> {
  const res = await api.post('/api/users', { data: { role: 'doctor', ...newDoctorData(overrides) } });
  expect(res.status(), `POST /api/users: ${await res.text()}`).toBe(201);
  return (await res.json()) as UserDetails;
}

export async function updateUser(
  api: APIRequestContext,
  id: number,
  patch: Record<string, unknown>,
): Promise<UserDetails> {
  const res = await api.patch(`/api/users/${id}`, { data: patch });
  expect(res.status(), `PATCH /api/users/${id}: ${await res.text()}`).toBe(200);
  return (await res.json()) as UserDetails;
}

export async function listUsers(api: APIRequestContext): Promise<UserDetails[]> {
  const res = await api.get('/api/users');
  expect(res.status()).toBe(200);
  return (await res.json()) as UserDetails[];
}

/** id пользователя по email (запрос от admin/root). */
export async function userIdByEmail(api: APIRequestContext, email: string): Promise<number> {
  const user = (await listUsers(api)).find((u) => u.email === email);
  if (!user) throw new Error(`Пользователь ${email} не найден в GET /api/users`);
  return user.id;
}

export interface NewAppointment {
  doctorId: number;
  date: string;
  start: string;
  end: string;
  patientName?: string;
  patientPhone?: string;
  comment?: string;
}

export async function createAppointment(api: APIRequestContext, a: NewAppointment): Promise<Appointment> {
  const res = await api.post('/api/appointments', {
    data: {
      patientName: `Пациент ${uid()}`,
      patientPhone: '+30 690 000 0000',
      lang: 'ru',
      ...a,
    },
  });
  expect(res.status(), `POST /api/appointments: ${await res.text()}`).toBe(201);
  return (await res.json()) as Appointment;
}

export async function cancelAppointment(api: APIRequestContext, id: number): Promise<Appointment> {
  const res = await api.post(`/api/appointments/${id}/cancel`);
  expect(res.status(), `POST /api/appointments/${id}/cancel: ${await res.text()}`).toBe(200);
  return (await res.json()) as Appointment;
}

export async function freeWindows(
  api: APIRequestContext,
  doctorId: number,
  date: string,
): Promise<{ start: string; end: string }[]> {
  const res = await api.get(`/api/doctors/${doctorId}/free-windows?date=${date}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { start: string; end: string }[];
}
