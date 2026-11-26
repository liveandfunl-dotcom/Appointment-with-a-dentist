import { Inject, Injectable } from '@nestjs/common';
import { APP_OPTIONS, AppOptions } from '../app.options';
import type { AuthUser } from '../auth/auth-user';
import { ApiError } from '../common/api-error';
import { formatTime, parseTime } from '../common/time';
import { assertValid, parseLang } from '../common/validation';
import { Clock } from '../clock/clock.service';
import { DbService } from '../db/db.service';
import { Lang, translate } from '../i18n/i18n';
import { MailService } from '../mail/mail.service';
import { parseId } from '../users/users.service';
import { ClinicDate, endMinutes, fromSec, mailDate, parseDate, toSec, todayAndNextMark, weekdayOf } from './clinic-time';

const MIN_DURATION = 60;

interface DoctorRow {
  id: number;
  email: string;
  isDoctor: number;
  isActive: number;
  workDays: string | null;
  workStart: number | null;
  workEnd: number | null;
}

interface AppointmentRow {
  id: number;
  doctorId: number;
  appointmentDate: number;
  endDate: number;
  createDate: number;
  creatorId: number;
  patientName: string;
  patientPhone: string;
  comment: string | null;
  status: 'active' | 'cancelled';
  cancelDate: number | null;
  cancelerId: number | null;
  doctorSurname: string;
  doctorName: string;
  doctorRoom: number | null;
}

/** Объект записи в ответах API (api.md, 2.4). */
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

export interface TimeWindow {
  start: string;
  end: string;
}

const SELECT_APPOINTMENT = `
  SELECT a.id, a.doctorId, a.appointmentDate, a.endDate, a.createDate, a.creatorId, a.patientName,
         a.patientPhone, a.comment, a.status, a.cancelDate, a.cancelerId,
         u.surname AS doctorSurname, u.name AS doctorName, u.room AS doctorRoom
  FROM Appointments a JOIN Users u ON u.id = a.doctorId`;

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

/** Строка 1…max символов после trim, иначе null. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length >= 1 && s.length <= max ? s : null;
}

/** Необязательный комментарий: нет / null / пустой → `''`; не строка или > 1000 → null. */
function parseComment(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length <= 1000 ? s : null;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function slotUnavailable(): ApiError {
  return new ApiError(400, 'SLOT_UNAVAILABLE');
}

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(APP_OPTIONS) private readonly options: AppOptions,
    private readonly dbs: DbService,
    private readonly clock: Clock,
    private readonly mail: MailService,
  ) {}

  private get tz(): string {
    return this.options.timezone ?? 'Europe/Athens';
  }

  /** api.md 4.11. */
  freeWindows(rawId: string, rawDate: unknown): TimeWindow[] {
    const date = parseDate(rawDate);
    assertValid(date ? [] : ['date']);
    const doctor = this.findDoctor(parseId(rawId));
    if (!doctor || Number(doctor.isActive) !== 1) throw ApiError.notFound();
    return this.windowsOf(doctor, date as ClinicDate);
  }

  /** api.md 4.12. */
  list(viewer: AuthUser, query: Record<string, unknown>): Appointment[] {
    const date = parseDate(query.date);
    const rawDoctorId = query.doctorId;
    const invalid: string[] = [];
    if (!date) invalid.push('date');
    const doctorIdOk = rawDoctorId === undefined || (typeof rawDoctorId === 'string' && /^[1-9]\d*$/.test(rawDoctorId));
    if (!doctorIdOk) invalid.push('doctorId');
    assertValid(invalid);

    const doctorId = viewer.role === 'doctor' ? viewer.id : rawDoctorId === undefined ? null : Number(rawDoctorId);
    const from = toSec(date as ClinicDate, 0, this.tz);
    const to = toSec(date as ClinicDate, 1440, this.tz);
    const rows = (
      doctorId === null
        ? this.dbs.db
            .prepare(`${SELECT_APPOINTMENT} WHERE a.appointmentDate >= ? AND a.appointmentDate < ? ORDER BY a.appointmentDate, a.id`)
            .all(from, to)
        : this.dbs.db
            .prepare(
              `${SELECT_APPOINTMENT} WHERE a.doctorId = ? AND a.appointmentDate >= ? AND a.appointmentDate < ? ORDER BY a.appointmentDate, a.id`,
            )
            .all(doctorId, from, to)
    ) as unknown as AppointmentRow[];
    return rows.map((row) => this.toAppointment(row, viewer));
  }

  /** api.md 4.13. */
  async create(viewer: AuthUser, body: Record<string, unknown>): Promise<Appointment & { mailSent: boolean }> {
    const invalid: string[] = [];
    const doctorId = body.doctorId;
    if (!isPositiveInt(doctorId)) invalid.push('doctorId');
    const date = parseDate(body.date);
    if (!date) invalid.push('date');
    const start = parseTime(body.start);
    if (start === null || start >= 1440) invalid.push('start');
    const end = parseTime(body.end);
    if (end === null || (start !== null && end - start < MIN_DURATION)) invalid.push('end');
    const patientName = text(body.patientName, 200);
    if (patientName === null) invalid.push('patientName');
    const patientPhone = text(body.patientPhone, 32);
    if (patientPhone === null) invalid.push('patientPhone');
    const comment = parseComment(body.comment);
    if (comment === null) invalid.push('comment');
    const lang = parseLang(body.lang);
    if (lang === null) invalid.push('lang');
    assertValid(invalid);

    const slot = { doctorId: doctorId as number, date: date as ClinicDate, start: start as number, end: end as number };
    if (viewer.role === 'doctor' && slot.doctorId !== viewer.id) throw ApiError.forbidden();

    const doctor = this.findDoctor(slot.doctorId);
    if (!doctor) throw ApiError.notFound();

    const startSec = toSec(slot.date, slot.start, this.tz);
    const endSec = toSec(slot.date, slot.end, this.tz);
    const workDays = (doctor.workDays ?? '').split(',').map(Number);
    if (
      Number(doctor.isActive) !== 1 ||
      !workDays.includes(weekdayOf(slot.date, this.tz)) ||
      slot.start < Number(doctor.workStart) ||
      slot.end > Number(doctor.workEnd) ||
      startSec <= this.clock.nowSec()
    ) {
      throw slotUnavailable();
    }

    const id = this.insertIfFree({
      doctorId: slot.doctorId,
      startSec,
      endSec,
      creatorId: viewer.id,
      patientName: patientName as string,
      patientPhone: patientPhone as string,
      comment: comment || null,
    });
    const appointment = this.toAppointment(this.findAppointment(id) as AppointmentRow, viewer);

    let mailSent = true;
    try {
      const vars = {
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        date: mailDate(appointment.date),
        start: appointment.start,
        end: appointment.end,
      };
      await this.mail.send({
        to: doctor.email,
        subject: translate(lang as Lang, 'mail.appointment.subject', vars),
        text: translate(lang as Lang, 'mail.appointment.text', vars),
      });
    } catch {
      mailSent = false;
    }
    return { ...appointment, mailSent };
  }

  /** api.md 4.14. */
  cancel(viewer: AuthUser, id: number): Appointment {
    const row = this.findAppointment(id);
    if (!row) throw ApiError.notFound();
    if (viewer.role === 'doctor' && Number(row.doctorId) !== viewer.id) throw ApiError.forbidden();
    const now = this.clock.nowSec();
    if (row.status !== 'active' || Number(row.appointmentDate) <= now) {
      throw new ApiError(400, 'NOT_CANCELLABLE');
    }
    this.dbs.db
      .prepare(`UPDATE Appointments SET status = 'cancelled', cancelDate = ?, cancelerId = ? WHERE id = ?`)
      .run(now, viewer.id, id);
    return this.toAppointment(this.findAppointment(id) as AppointmentRow, viewer);
  }

  /** Проверка пересечения и вставка в одной транзакции (data-model.md, 2.2). */
  private insertIfFree(a: {
    doctorId: number;
    startSec: number;
    endSec: number;
    creatorId: number;
    patientName: string;
    patientPhone: string;
    comment: string | null;
  }): number {
    const db = this.dbs.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const taken = db
        .prepare(
          `SELECT 1 FROM Appointments
           WHERE doctorId = ? AND status = 'active' AND appointmentDate < ? AND endDate > ? LIMIT 1`,
        )
        .get(a.doctorId, a.endSec, a.startSec);
      if (taken) throw new ApiError(409, 'SLOT_TAKEN');
      const result = db
        .prepare(
          `INSERT INTO Appointments (doctorId, appointmentDate, endDate, createDate, creatorId, patientName, patientPhone, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(a.doctorId, a.startSec, a.endSec, this.clock.nowSec(), a.creatorId, a.patientName, a.patientPhone, a.comment);
      db.exec('COMMIT');
      return Number(result.lastInsertRowid);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Алгоритм свободных окон (api.md, 4.11). */
  private windowsOf(doctor: DoctorRow, date: ClinicDate): TimeWindow[] {
    const { today, nextMark } = todayAndNextMark(this.clock.now(), this.tz);
    if (date.iso < today) return [];
    const workDays = (doctor.workDays ?? '').split(',').map(Number);
    if (!workDays.includes(weekdayOf(date, this.tz))) return [];

    let from = Number(doctor.workStart);
    const to = Number(doctor.workEnd);
    if (date.iso === today) from = Math.max(from, nextMark);

    const busy = this.dbs.db
      .prepare(
        `SELECT appointmentDate, endDate FROM Appointments
         WHERE doctorId = ? AND status = 'active' AND appointmentDate >= ? AND appointmentDate < ?
         ORDER BY appointmentDate`,
      )
      .all(Number(doctor.id), toSec(date, 0, this.tz), toSec(date, 1440, this.tz)) as unknown as Array<{
      appointmentDate: number;
      endDate: number;
    }>;

    const windows: Array<[number, number]> = [];
    let cursor = from;
    for (const b of busy) {
      const s = fromSec(Number(b.appointmentDate), this.tz).minutes;
      const e = endMinutes(Number(b.endDate), date.iso, this.tz);
      if (s > cursor) windows.push([cursor, Math.min(s, to)]);
      cursor = Math.max(cursor, e);
    }
    windows.push([cursor, to]);
    return windows
      .filter(([s, e]) => e - s >= MIN_DURATION)
      .map(([s, e]) => ({ start: formatTime(s), end: formatTime(e) }));
  }

  /** Пользователь-врач по id или null (нет пользователя или он не врач). */
  private findDoctor(id: number): DoctorRow | null {
    const row = this.dbs.db
      .prepare('SELECT id, email, isDoctor, isActive, workDays, workStart, workEnd FROM Users WHERE id = ?')
      .get(id) as unknown as DoctorRow | undefined;
    return row && Number(row.isDoctor) === 1 ? row : null;
  }

  private findAppointment(id: number): AppointmentRow | undefined {
    return this.dbs.db.prepare(`${SELECT_APPOINTMENT} WHERE a.id = ?`).get(id) as unknown as AppointmentRow | undefined;
  }

  private toAppointment(row: AppointmentRow, viewer: AuthUser): Appointment {
    const doctorId = Number(row.doctorId);
    const start = fromSec(Number(row.appointmentDate), this.tz);
    const mayCancel = viewer.role !== 'doctor' || viewer.id === doctorId;
    return {
      id: Number(row.id),
      doctorId,
      date: start.date,
      start: formatTime(start.minutes),
      end: formatTime(endMinutes(Number(row.endDate), start.date, this.tz)),
      doctor: { id: doctorId, surname: row.doctorSurname, name: row.doctorName, room: nullableNumber(row.doctorRoom) },
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      comment: row.comment,
      status: row.status,
      canCancel: row.status === 'active' && Number(row.appointmentDate) > this.clock.nowSec() && mayCancel,
      creatorId: Number(row.creatorId),
      createDate: Number(row.createDate),
      cancelerId: nullableNumber(row.cancelerId),
      cancelDate: nullableNumber(row.cancelDate),
    };
  }
}
