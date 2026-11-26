import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { Clock } from '../clock/clock.service';

const WINDOW_MS = 15 * 60 * 1000;
const IDENTIFIER_LIMIT = 5;
const IP_LIMIT = 20;
const SWEEP_THRESHOLD = 10_000;

/**
 * In-memory rate limit входа (api.md, раздел 3): скользящее окно 15 минут по Clock,
 * 5 запросов на идентификатор и 20 на IP, у каждого маршрута свои счётчики.
 * Отклонённые (429) запросы в счётчики не записываются. Свой экземпляр на каждый createApp.
 */
@Injectable()
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly clock: Clock) {}

  /** Учитывает запрос или бросает 429 TOO_MANY_REQUESTS. `identifier` не строка → считается только IP. */
  consume(route: string, ip: string, identifier: string | undefined): void {
    const now = this.clock.now().getTime();
    if (this.hits.size > SWEEP_THRESHOLD) this.sweep(now);

    const keys: [string, number][] = [[`${route}|ip|${ip}`, IP_LIMIT]];
    if (identifier !== undefined) keys.push([`${route}|id|${identifier}`, IDENTIFIER_LIMIT]);

    const windows = keys.map(([key, limit]) => ({ key, limit, list: this.recent(key, now) }));
    if (windows.some((w) => w.list.length >= w.limit)) {
      throw new ApiError(429, 'TOO_MANY_REQUESTS');
    }
    for (const w of windows) {
      w.list.push(now);
      this.hits.set(w.key, w.list);
    }
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  }

  private sweep(now: number): void {
    for (const key of [...this.hits.keys()]) {
      const list = this.recent(key, now);
      if (list.length === 0) this.hits.delete(key);
      else this.hits.set(key, list);
    }
  }
}
