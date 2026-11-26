import { Inject, Injectable } from '@nestjs/common';
import { APP_OPTIONS, AppOptions } from '../app.options';

@Injectable()
export class Clock {
  constructor(@Inject(APP_OPTIONS) private readonly options: AppOptions) {}

  now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  /** Текущее время в unix-секундах (формат хранения в БД). */
  nowSec(): number {
    return Math.floor(this.now().getTime() / 1000);
  }
}
