import { parseTime } from '../common/time';
import { assertValid, boundedText, isPositiveInt, parseLang } from '../common/validation';
import type { Lang } from '../i18n/i18n';
import { ClinicDate, parseDate } from './clinic-time';
import { MIN_DURATION } from './free-windows';

/** Разобранное тело `POST /api/appointments` (api.md, 4.13). */
export interface NewAppointmentInput {
  doctorId: number;
  date: ClinicDate;
  /** Минуты от полуночи. */
  start: number;
  end: number;
  patientName: string;
  patientPhone: string;
  /** Пустой комментарий хранится как NULL. */
  comment: string | null;
  lang: Lang;
}

/** Разобранный query `GET /api/appointments` (api.md, 4.12). */
export interface AppointmentsQuery {
  date: ClinicDate;
  /** Фильтр по врачу; null — все врачи. */
  doctorId: number | null;
}

/** Необязательный комментарий: нет / null / пустой → `''`; не строка или > 1000 → null. */
function parseComment(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length <= 1000 ? s : null;
}

/** Разбирает тело создания записи; невалидные поля → 400 VALIDATION_ERROR со списком полей. */
export function parseNewAppointment(body: Record<string, unknown>): NewAppointmentInput {
  const invalid: string[] = [];
  const doctorId = body.doctorId;
  if (!isPositiveInt(doctorId)) invalid.push('doctorId');
  const date = parseDate(body.date);
  if (!date) invalid.push('date');
  const start = parseTime(body.start);
  if (start === null || start >= 1440) invalid.push('start');
  const end = parseTime(body.end);
  if (end === null || (start !== null && end - start < MIN_DURATION)) invalid.push('end');
  const patientName = boundedText(body.patientName, 200);
  if (patientName === null) invalid.push('patientName');
  const patientPhone = boundedText(body.patientPhone, 32);
  if (patientPhone === null) invalid.push('patientPhone');
  const comment = parseComment(body.comment);
  if (comment === null) invalid.push('comment');
  const lang = parseLang(body.lang);
  if (lang === null) invalid.push('lang');
  assertValid(invalid);

  return {
    doctorId: doctorId as number,
    date: date as ClinicDate,
    start: start as number,
    end: end as number,
    patientName: patientName as string,
    patientPhone: patientPhone as string,
    comment: comment || null,
    lang: lang as Lang,
  };
}

/** Разбирает query списка записей. */
export function parseAppointmentsQuery(query: Record<string, unknown>): AppointmentsQuery {
  const date = parseDate(query.date);
  const rawDoctorId = query.doctorId;
  const invalid: string[] = [];
  if (!date) invalid.push('date');
  const doctorIdOk = rawDoctorId === undefined || (typeof rawDoctorId === 'string' && /^[1-9]\d*$/.test(rawDoctorId));
  if (!doctorIdOk) invalid.push('doctorId');
  assertValid(invalid);
  return { date: date as ClinicDate, doctorId: rawDoctorId === undefined ? null : Number(rawDoctorId) };
}

/** Параметр `date` свободных окон; невалидный → 400 VALIDATION_ERROR ['date']. */
export function parseDateParam(value: unknown): ClinicDate {
  const date = parseDate(value);
  assertValid(date ? [] : ['date']);
  return date as ClinicDate;
}
