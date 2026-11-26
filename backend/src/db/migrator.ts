import { DatabaseSync } from 'node:sqlite';
import { toUnixSec } from '../common/time';
import { Migration } from './migrations';
import { inTransaction } from './transaction';

/** Применяет ещё не применённые миграции по возрастанию version, каждую в своей транзакции (data-model.md, раздел 3). */
export function runMigrations(db: DatabaseSync, migrations: Migration[], now: () => Date): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version   INTEGER PRIMARY KEY,
    name      TEXT    NOT NULL,
    appliedAt INTEGER NOT NULL
  );`);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => Number(r.version)),
  );
  const pending = migrations.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);
  const insert = db.prepare('INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)');

  for (const m of pending) {
    inTransaction(db, () => {
      db.exec(m.up);
      insert.run(m.version, m.name, toUnixSec(now()));
    });
  }
}
