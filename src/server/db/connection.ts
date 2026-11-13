import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { SCHEMA_SQL } from './schema.js';
import { seedDatabase, seedNewModules } from './seed.js';

let dbInstance: Database.Database | null = null;

function ensureSchemaUpgrades(db: Database.Database): void {
  const incCols = db.prepare(`PRAGMA table_info(incidents)`).all() as Array<{ name: string }>;
  const hasRoadName = incCols.some((c) => c.name === 'road_name');
  if (incCols.length > 0 && !hasRoadName) {
    // Rebuild incidents table cleanly to expand CHECK constraint and add violation/expiry columns
    db.pragma('foreign_keys = OFF');
    const migrate = db.transaction(() => {
      db.exec(`
        ALTER TABLE incidents RENAME TO incidents_legacy;
        CREATE TABLE incidents (
          id TEXT PRIMARY KEY,
          reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN (
            'ACCIDENT', 'ROADBLOCK', 'CONGESTION', 'CONSTRUCTION', 'LANE_CLOSURE', 'BREAKDOWN', 'FLOODING',
            'WRONG_WAY_DRIVING', 'ILLEGAL_PARKING', 'BLOCKING_ROAD', 'NO_PARKING_ZONE', 'ROAD_OBSTRUCTION',
            'OTHER'
          )),
          description TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          road_name TEXT,
          landmark TEXT,
          road_segment_id TEXT REFERENCES road_segments(id) ON DELETE SET NULL,
          severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          estimated_severity TEXT NOT NULL CHECK (estimated_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          severity_confidence REAL NOT NULL DEFAULT 0.75,
          severity_reasons_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED')),
          image_url TEXT,
          possible_duplicate INTEGER NOT NULL DEFAULT 0,
          canonical_incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL,
          duplicate_score REAL,
          duplicate_reason TEXT,
          verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          occurred_at TEXT,
          expires_at TEXT,
          still_present_count INTEGER NOT NULL DEFAULT 1,
          last_confirmed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          resolved_at TEXT
        );
        INSERT INTO incidents (
          id, reporter_id, type, description, latitude, longitude, road_name, landmark, road_segment_id,
          severity, estimated_severity, severity_confidence, severity_reasons_json,
          status, image_url, possible_duplicate, canonical_incident_id, duplicate_score, duplicate_reason,
          verified_by, occurred_at, expires_at, still_present_count, last_confirmed_at, created_at, updated_at, resolved_at
        )
        SELECT
          id, reporter_id, type, description, latitude, longitude, NULL, NULL, road_segment_id,
          severity, estimated_severity, severity_confidence, severity_reasons_json,
          status, image_url, possible_duplicate, canonical_incident_id, duplicate_score, duplicate_reason,
          verified_by, created_at, NULL, 1, created_at, created_at, updated_at, resolved_at
        FROM incidents_legacy;
        DROP TABLE incidents_legacy;
        CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
        CREATE INDEX IF NOT EXISTS idx_incidents_segment ON incidents(road_segment_id);
        CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
      `);
    });
    migrate();
    db.pragma('foreign_keys = ON');
  }
}

export function getDb(customPath?: string): Database.Database {
  if (dbInstance) return dbInstance;

  const targetPath = customPath || env.databasePath;
  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  db.pragma('foreign_keys = ON');
  if (targetPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  db.exec(SCHEMA_SQL);
  ensureSchemaUpgrades(db);
  dbInstance = db;

  const userCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }
  ).cnt;
  if (userCount === 0) {
    seedDatabase(db);
  } else {
    seedNewModules(db);
  }

  return dbInstance;
}

export function resetDbForTests(): Database.Database {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  return getDb(':memory:');
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
