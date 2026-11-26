import { api } from './client';
import type { Appointment, FreeWindow } from './types';

/** Список записей дня; без `doctorId` — по всем врачам. */
export function listAppointments(date: string, doctorId?: string): Promise<Appointment[]> {
  const params = new URLSearchParams({ date });
  if (doctorId) params.set('doctorId', doctorId);
  return api.get<Appointment[]>(`/api/appointments?${params.toString()}`);
}

export interface NewAppointment {
  doctorId: number;
  date: string;
  start: string;
  end: string;
  patientName: string;
  patientPhone: string;
  comment: string;
  lang: string;
}

export const createAppointment = (body: NewAppointment) =>
  api.post<Appointment & { mailSent: boolean }>('/api/appointments', body);

export const cancelAppointment = (id: number) => api.post<Appointment>(`/api/appointments/${id}/cancel`);

export const getFreeWindows = (doctorId: number, date: string) =>
  api.get<FreeWindow[]>(`/api/doctors/${doctorId}/free-windows?date=${date}`);
