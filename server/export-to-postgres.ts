import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/edtu.sqlite');
const rawSchema = readFileSync('server/schema.sql', 'utf8');

// Cut off the seed block at the end of schema.sql (lines starting from INSERT OR IGNORE)
const schemaOnly = rawSchema.replace(/INSERT OR IGNORE[\s\S]*$/, '');

// Convert SQLite schema to clean PostgreSQL DDL
let pgSchema = schemaOnly
  .replace(/PRAGMA foreign_keys = ON;\s*/gi, '')
  .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
  .replace(/datetime\('now',\s*'\+8 hours'\)/gi, "CURRENT_TIMESTAMP + INTERVAL '8 hours'")
  .replace(/\bINTEGER PRIMARY KEY\b/gi, 'BIGSERIAL PRIMARY KEY')
  .replace(/\buser_code COLLATE NOCASE\b/gi, 'LOWER(user_code)')
  .replace(/\bemail COLLATE NOCASE\b/gi, 'LOWER(email)');

const header = `-- =======================================================================
-- eDTU UNIVERSITY PORTAL - POSTGRESQL CLOUD SCHEMA & COMPLETE SEED DATA
-- Target: Supabase / Neon / Render / Aiven / Any PostgreSQL 14+
-- =======================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`;

// Optimal table order to satisfy all Foreign Keys
const tablesInOrder = [
  'schema_migrations',
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_roles',
  'university_units',
  'faculties',
  'departments',
  'positions',
  'students',
  'lecturers',
  'staff',
  'courses',
  'enrollment_periods',
  'course_sections',
  'lecturer_course_assignments',
  'staff_department_assignments',
  'class_schedules',
  'enrollments',
  'grade_components',
  'grades',
  'grade_approval_requests',
  'grade_change_logs',
  'grade_adjustment_requests',
  'assignments',
  'assignment_submissions',
  'course_documents',
  'attendance_sessions',
  'attendance',
  'tuition_records',
  'payment_transactions',
  'student_support_requests',
  'support_request_history',
  'internal_tasks',
  'news',
  'data_scopes',
  'audit_logs',
];

function escapePg(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

let seedSql = '\n-- =======================================================================\n-- COMPLETE SEED DATA FOR DUY TAN UNIVERSITY\n-- =======================================================================\n';

let totalRows = 0;
for (const tableName of tablesInOrder) {
  try {
    let rows: Record<string, any>[] = [];
    if (tableName === 'university_units') {
      // Sort university_units so parent_id IS NULL comes first
      rows = db.prepare('SELECT * FROM university_units ORDER BY parent_id IS NOT NULL, id').all() as Record<string, any>[];
    } else {
      rows = db.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, any>[];
    }
    if (rows.length === 0) continue;

    seedSql += `\n-- Table: ${tableName} (${rows.length} rows)\n`;
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = Object.values(row).map(escapePg);
      seedSql += `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`;
      totalRows++;
    }
  } catch (err: any) {
    console.error(`Error dumping table ${tableName}:`, err.message);
  }
}

const fullSql = header + pgSchema + seedSql;
writeFileSync('data/edtu_cloud_postgres.sql', fullSql, 'utf8');
console.log(`Successfully generated data/edtu_cloud_postgres.sql: ${totalRows} rows dumped (${fullSql.length} bytes).`);
