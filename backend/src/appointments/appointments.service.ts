import { Inject, Injectable } from '@nestjs/common';
import type { Appointment, TimeWindow } from '@clinic/shared';
import { APP_OPTIONS, ResolvedAppOptions } from '../app.options';
import type { AuthUser } from '../auth/auth-user';
import { ApiError } from '../common/api-error';
import { formatTime } from '../common/time';
import { nullableNumber } from '../common/validation';
import { Clock } from '../clock/clock.service';
import { DbService } from '../db/db.service';
import { translate } from '../i18n/i18n';
import { MailService } from '../mail/mail.service';
import { parseWorkDays } from '../users/work-days';
import type { AppointmentsQuery, NewAppointmentInput } from './appointment-fields';
import { ClinicDate, endMinutes, fromSec, mailDate, toSec, todayAndNextMark, weekdayOf } from './clinic-time';
import { BusyInterval, computeFreeWindows } from './free-windows';

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

const SELECT_APPOINTMENT = `
  SELECT a.id, a.doctorId, a.appointmentDate, a.endDate, a.createDate, a.creatorId, a.patientName,
         a.patientPhone, a.comment, a.status, a.cancelDate, a.cancelerId,
         u.surname AS doctorSurname, u.name AS doctorName, u.room AS doctorRoom
  FROM Appointments a JOIN Users u ON u.id = a.doctorId`;

function slotUnavailable(): ApiError {
  return new ApiError(400, 'SLOT_UNAVAILABLE');
}

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(APP_OPTIONS) private readonly options: ResolvedAppOptions,
    private readonly dbs: DbService,
    private readonly clock: Clock,
    private readonly mail: MailService,
  ) {}

  private get tz(): string {
    return this.options.timezone;
  }

  /** api.md 4.11. */
  freeWindows(doctorId: number, date: ClinicDate): TimeWindow[] {
    const doctor = this.findDoctor(doctorId);
    if (!doctor || doctor.isActive !== 1) throw ApiError.notFound();
    return this.windowsOf(doctor, date);
  }

  /** api.md 4.12. Врач видит только свои записи, остальные — по фильтру. */
  list(viewer: AuthUser, query: AppointmentsQuery): Appointment[] {
    const doctorId = viewer.role === 'doctor' ? viewer.id : query.doctorId;
    const from = toSec(query.date, 0, this.tz);
    const to = toSec(query.date, 1440, this.tz);
    const rows =
      doctorId === null
        ? this.dbs.all<AppointmentRow>(
            `${SELECT_APPOINTMENT} WHERE a.appointmentDate >= ? AND a.appointmentDate < ? ORDER BY a.appointmentDate, a.id`,
            from,
            to,
          )
        : this.dbs.all<AppointmentRow>(
            `${SELECT_APPOINTMENT} WHERE a.doctorId = ? AND a.appointmentDate >= ? AND a.appointmentDate < ? ORDER BY a.appointmentDate, a.id`,
            doctorId,
            from,
            to,
          );
    return rows.map((row) => this.toAppointment(row, viewer));
  }

  /** api.md 4.13. */
  async create(viewer: AuthUser, input: NewAppointmentInput): Promise<Appointment & { mailSent: boolean }> {
    if (viewer.role === 'doctor' && input.doctorId !== viewer.id) throw ApiError.forbidden();

    const doctor = this.findDoctor(input.doctorId);
    if (!doctor) throw ApiError.notFound();

    const startSec = toSec(input.date, input.start, this.tz);
    const endSec = toSec(input.date, input.end, this.tz);
    if (
      doctor.isActive !== 1 ||
      !parseWorkDays(doctor.workDays).includes(weekdayOf(input.date, this.tz)) ||
      input.start < Number(doctor.workStart) ||
      input.end > Number(doctor.workEnd) ||
      startSec <= this.clock.nowSec()
    ) {
      throw slotUnavailable();
    }

    const id = this.insertIfFree(input, startSec, endSec, viewer.id);
    const appointment = this.toAppointment(this.findAppointment(id) as AppointmentRow, viewer);
    const mailSent = await this.notifyDoctor(doctor, appointment, input.lang);
    return { ...appointment, mailSent };
  }

  /** api.md 4.14. */
  cancel(viewer: AuthUser, id: number): Appointment {
    const row = this.findAppointment(id);
    if (!row) throw ApiError.notFound();
    if (viewer.role === 'doctor' && row.doctorId !== viewer.id) throw ApiError.forbidden();
    const now = this.clock.nowSec();
    if (row.status !== 'active' || row.appointmentDate <= now) {
      throw new ApiError(400, 'NOT_CANCELLABLE');
    }
    this.dbs.run(`UPDATE Appointments SET status = 'cancelled', cancelDate = ?, cancelerId = ? WHERE id = ?`, now, viewer.id, id);
    return this.toAppointment(this.findAppointment(id) as AppointmentRow, viewer);
  }

  /** Письмо врачу о новой записи (api.md, 5). Сбой почты не отменяет запись: возвращает false. */
  private async notifyDoctor(doctor: DoctorRow, appointment: Appointment, lang: NewAppointmentInput['lang']): Promise<boolean> {
    const vars = {
      patientName: appointment.patientName,
      patientPhone: appointment.patientPhone,
      date: mailDate(appointment.date),
      start: appointment.start,
      end: appointment.end,
    };
    try {
      await this.mail.send({
        to: doctor.email,
        subject: translate(lang, 'mail.appointment.subject', vars),
        text: translate(lang, 'mail.appointment.text', vars),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Проверка пересечения и вставка в одной транзакции (data-model.md, 2.2). */
  private insertIfFree(input: NewAppointmentInput, startSec: number, endSec: number, creatorId: number): number {
    return this.dbs.transaction(() => {
      const taken = this.dbs.get(
        `SELECT 1 FROM Appointments
         WHERE doctorId = ? AND status = 'active' AND appointmentDate < ? AND endDate > ? LIMIT 1`,
        input.doctorId,
        endSec,
        startSec,
      );
      if (taken) throw new ApiError(409, 'SLOT_TAKEN');
      const result = this.dbs.run(
        `INSERT INTO Appointments (doctorId, appointmentDate, endDate, createDate, creatorId, patientName, patientPhone, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        input.doctorId,
        startSec,
        endSec,
        this.clock.nowSec(),
        creatorId,
        input.patientName,
        input.patientPhone,
        input.comment,
      );
      return Number(result.lastInsertRowid);
    });
  }

  /** Свободные окна врача на дату: выбирает из БД занятое время и отдаёт расчёт `computeFreeWindows`. */
  private windowsOf(doctor: DoctorRow, date: ClinicDate): TimeWindow[] {
    const { today, nextMark } = todayAndNextMark(this.clock.now(), this.tz);
    if (date.iso < today) return [];
    if (!parseWorkDays(doctor.workDays).includes(weekdayOf(date, this.tz))) return [];

    const rows = this.dbs.all<{ appointmentDate: number; endDate: number }>(
      `SELECT appointmentDate, endDate FROM Appointments
       WHERE doctorId = ? AND status = 'active' AND appointmentDate >= ? AND appointmentDate < ?
       ORDER BY appointmentDate`,
      doctor.id,
      toSec(date, 0, this.tz),
      toSec(date, 1440, this.tz),
    );
    const busy: BusyInterval[] = rows.map((b) => ({
      start: fromSec(b.appointmentDate, this.tz).minutes,
      end: endMinutes(b.endDate, date.iso, this.tz),
    }));
    return computeFreeWindows({
      workStart: Number(doctor.workStart),
      workEnd: Number(doctor.workEnd),
      earliest: date.iso === today ? nextMark : null,
      busy,
    });
  }

  /** Пользователь-врач по id или null (нет пользователя или он не врач). */
  private findDoctor(id: number): DoctorRow | null {
    const row = this.dbs.get<DoctorRow>(
      'SELECT id, email, isDoctor, isActive, workDays, workStart, workEnd FROM Users WHERE id = ?',
      id,
    );
    return row && row.isDoctor === 1 ? row : null;
  }

  private findAppointment(id: number): AppointmentRow | undefined {
    return this.dbs.get<AppointmentRow>(`${SELECT_APPOINTMENT} WHERE a.id = ?`, id);
  }

  private toAppointment(row: AppointmentRow, viewer: AuthUser): Appointment {
    const start = fromSec(row.appointmentDate, this.tz);
    const mayCancel = viewer.role !== 'doctor' || viewer.id === row.doctorId;
    return {
      id: row.id,
      doctorId: row.doctorId,
      date: start.date,
      start: formatTime(start.minutes),
      end: formatTime(endMinutes(row.endDate, start.date, this.tz)),
      doctor: { id: row.doctorId, surname: row.doctorSurname, name: row.doctorName, room: nullableNumber(row.doctorRoom) },
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      comment: row.comment,
      status: row.status,
      canCancel: row.status === 'active' && row.appointmentDate > this.clock.nowSec() && mayCancel,
      creatorId: row.creatorId,
      createDate: row.createDate,
      cancelerId: nullableNumber(row.cancelerId),
      cancelDate: nullableNumber(row.cancelDate),
    };
  }
}
