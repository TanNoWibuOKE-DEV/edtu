import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const databasePath = resolve(process.env.DB_PATH || './data/edtu.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const versionOne = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(1);
  if (!versionOne) {
    const schema = readFileSync(schemaPath, 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(schema);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)').run(1);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const versionTwo = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(2);
  if (!versionTwo) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns = db.prepare('PRAGMA table_info(user_roles)').all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === 'is_primary')) {
        db.exec('ALTER TABLE user_roles ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1))');
      }
      db.exec(`UPDATE user_roles AS selected SET is_primary=1
        WHERE selected.revoked_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_roles current WHERE current.user_id=selected.user_id AND current.revoked_at IS NULL AND current.is_primary=1)
          AND selected.id=(SELECT candidate.id FROM user_roles candidate WHERE candidate.user_id=selected.user_id AND candidate.revoked_at IS NULL ORDER BY candidate.granted_at,candidate.id LIMIT 1)`);
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_primary ON user_roles(user_id) WHERE is_primary = 1 AND revoked_at IS NULL');
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)').run(2);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function inTransaction<T>(operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
