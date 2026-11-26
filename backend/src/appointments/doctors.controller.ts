import { Controller, Get, Param, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorators';
import { AppointmentsService, TimeWindow } from './appointments.service';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** api.md 4.11. */
  @Get(':id/free-windows')
  @Auth()
  freeWindows(@Param('id') id: string, @Query('date') date: unknown): TimeWindow[] {
    return this.appointments.freeWindows(id, date);
  }
}
