import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { Auth, CurrentUser } from '../auth/auth.decorators';
import { bodyOf } from '../common/validation';
import { parseId } from '../users/users.service';
import { Appointment, AppointmentsService } from './appointments.service';

@Controller('appointments')
@Auth()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** api.md 4.12. */
  @Get()
  list(@CurrentUser() viewer: AuthUser, @Query() query: Record<string, unknown>): Appointment[] {
    return this.appointments.list(viewer, query);
  }

  /** api.md 4.13. */
  @Post()
  create(@CurrentUser() viewer: AuthUser, @Body() body: unknown): Promise<Appointment & { mailSent: boolean }> {
    return this.appointments.create(viewer, bodyOf(body));
  }

  /** api.md 4.14. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() viewer: AuthUser, @Param('id') id: string): Appointment {
    return this.appointments.cancel(viewer, parseId(id));
  }
}
