import { DatabaseSync } from 'node:sqlite';

/** Выполняет `fn` в одной транзакции: исключение откатывает изменения и пробрасывается. Единственное место `BEGIN`. */
export function inTransaction<R>(db: DatabaseSync, fn: () => R): R {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
