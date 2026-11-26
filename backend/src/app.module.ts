import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { APP_OPTIONS, AppOptions } from './app.options';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { Clock } from './clock/clock.service';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { DbService } from './db/db.service';
import { HealthController } from './health/health.controller';
import { MailService } from './mail/mail.service';
import { UsersModule } from './users/users.module';

@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [AuthModule, UsersModule, AppointmentsModule],
      controllers: [HealthController],
      providers: [
        { provide: APP_OPTIONS, useValue: options },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        Clock,
        DbService,
        MailService,
      ],
      exports: [APP_OPTIONS, Clock, DbService, MailService],
    };
  }
}
