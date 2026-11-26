import { Controller, Get, Inject } from '@nestjs/common';
import type { Clinic } from '@clinic/shared';
import { APP_OPTIONS, ResolvedAppOptions } from '../app.options';

@Controller('clinic')
export class ClinicController {
  constructor(@Inject(APP_OPTIONS) private readonly options: ResolvedAppOptions) {}

  /** api.md 4.16. Публичный: frontend берёт отсюда пояс клиники для «сегодня». */
  @Get()
  get(): Clinic {
    return { timezone: this.options.timezone };
  }
}
