import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DoctorsController } from './doctors.controller';

/** Записи на приём и свободные окна врачей (api.md, 4.11–4.14). */
@Module({
  controllers: [AppointmentsController, DoctorsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
