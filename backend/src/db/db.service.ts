import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementResultingChanges } from 'node:sqlite';
import { APP_OPTIONS, ResolvedAppOptions } from '../app.options';
import { Clock } from '../clock/clock.service';
import { MIGRATIONS } from './migrations';
import { runMigrations } from './migrator';
import { inTransaction } from './transaction';
import { runSeeds } from './seed';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor(
    @Inject(APP_OPTIONS) private readonly options: ResolvedAppOptions,
    private readonly clock: Clock,
  ) {
    if (options.dbPath !== ':memory:') {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(options.dbPath);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = DELETE;
      PRAGMA busy_timeout = 5000;
    `);
  }

  /** Миграции и сиды до приёма запросов (data-model.md, разделы 3–4). */
  async onModuleInit(): Promise<void> {
    const now = (): Date => this.clock.now();
    runMigrations(this.db, MIGRATIONS, now);
    await runSeeds(this.db, now, this.options.seedDev);
  }

  onModuleDestroy(): void {
    if (this.db.isOpen) this.db.close();
  }

  /** Первая строка результата, приведённая к `T` (форму строки задаёт вызывающий), или undefined. */
  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SQLInputValue[]): StatementResultingChanges {
    return this.db.prepare(sql).run(...params);
  }

  /** Выполняет `fn` в одной транзакции (см. `inTransaction`). */
  transaction<R>(fn: () => R): R {
    return inTransaction(this.db, fn);
  }
}
