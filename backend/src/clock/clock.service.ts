import { Inject, Injectable } from '@nestjs/common';
import { APP_OPTIONS, ResolvedAppOptions } from '../app.options';
import { toUnixSec } from '../common/time';

@Injectable()
export class Clock {
  constructor(@Inject(APP_OPTIONS) private readonly options: ResolvedAppOptions) {}

  now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  /** Текущее время в unix-секундах (формат хранения в БД). */
  nowSec(): number {
    return toUnixSec(this.now());
  }
}
