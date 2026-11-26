import { DatabaseSync } from 'node:sqlite';
import { Migration } from './migrations';

/** Применяет ещё не применённые миграции по возрастанию version (data-model.md, раздел 3). */
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
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.up);
      insert.run(m.version, m.name, Math.floor(now().getTime() / 1000));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
