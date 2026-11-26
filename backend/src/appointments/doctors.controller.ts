import { Controller, Get, Param, Query } from '@nestjs/common';
import type { TimeWindow } from '@clinic/shared';
import { Auth } from '../auth/auth.decorators';
import { parseId } from '../common/validation';
import { parseDateParam } from './appointment-fields';
import { AppointmentsService } from './appointments.service';


@Controller('doctors')
export class DoctorsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** api.md 4.11. Порядок проверок: date (400) → id (404). */
  @Get(':id/free-windows')
  @Auth()
  freeWindows(@Param('id') id: string, @Query('date') rawDate: unknown): TimeWindow[] {
    const date = parseDateParam(rawDate);
    return this.appointments.freeWindows(parseId(id), date);
  }
}
