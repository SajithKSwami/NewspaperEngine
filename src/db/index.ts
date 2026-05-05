import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCHEMA } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../newspaper.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');   // concurrent reads while writing
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL'); // safe with WAL, faster than FULL

  _db.exec(SCHEMA);
  return _db;
}

// Deterministic 16-char hex ID from any number of string parts.
// Stable across restarts — same URL always produces the same article ID.
export function makeId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\x00')).digest('hex').slice(0, 16);
}
