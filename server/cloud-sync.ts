import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';

const sqliteDb = new DatabaseSync('data/edtu.sqlite');

export const pgPool = new pg.Pool({
  host: 'db.zpenkfrgrosreaketgzr.supabase.co',
  port: 5432,
  user: 'postgres',
  password: '@@tan15082008##',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

const tablePrimaryKeys: Record<string, string[]> = {
  departments: ['unit_id'],
  faculties: ['unit_id'],
  lecturers: ['user_id'],
  staff: ['user_id'],
  students: ['user_id'],
  role_permissions: ['role_id', 'permission_id'],
  schema_migrations: ['version'],
};

function getPrimaryKeys(table: string): string[] {
  return tablePrimaryKeys[table] || ['id'];
}

export async function testCloudConnection() {
  const client = await pgPool.connect();
  try {
    const res = await client.query('SELECT current_database(), current_user, version()');
    return { ok: true, info: res.rows[0] };
  } finally {
    client.release();
  }
}

export async function syncToCloud() {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const tables = [
      'roles', 'permissions', 'role_permissions', 'users', 'user_roles',
      'university_units', 'faculties', 'departments', 'positions', 'students',
      'lecturers', 'staff', 'courses', 'enrollment_periods', 'course_sections',
      'lecturer_course_assignments', 'staff_department_assignments',
      'class_schedules', 'enrollments', 'grade_components', 'grades',
      'grade_approval_requests', 'grade_change_logs', 'grade_adjustment_requests',
      'assignments', 'assignment_submissions', 'course_documents',
      'attendance_sessions', 'attendance', 'tuition_records', 'payment_transactions',
      'student_support_requests', 'support_request_history', 'internal_tasks',
      'news', 'data_scopes', 'audit_logs'
    ];

    let totalSynced = 0;
    for (const t of tables) {
      const rows = sqliteDb.prepare(`SELECT * FROM ${t}`).all() as Record<string, any>[];
      const pks = getPrimaryKeys(t);

      for (const row of rows) {
        const cols = Object.keys(row);
        const params = Object.values(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updateCols = cols.filter(c => !pks.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ');

        const conflictClause = updateCols.length > 0
          ? `ON CONFLICT (${pks.join(', ')}) DO UPDATE SET ${updateCols}`
          : `ON CONFLICT (${pks.join(', ')}) DO NOTHING`;

        const sql = `
          INSERT INTO ${t} (${cols.join(', ')})
          VALUES (${placeholders})
          ${conflictClause}
        `;
        await client.query(sql, params);
        totalSynced++;
      }
    }
    await client.query('COMMIT');
    return { ok: true, totalSynced };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function pullFromCloud() {
  const client = await pgPool.connect();
  try {
    const tables = [
      'users', 'students', 'lecturers', 'staff', 'courses', 'course_sections',
      'enrollments', 'grade_components', 'grades', 'tuition_records', 'payment_transactions',
      'student_support_requests', 'internal_tasks', 'news', 'audit_logs'
    ];
    let totalPulled = 0;
    for (const t of tables) {
      const pks = getPrimaryKeys(t);
      const res = await client.query(`SELECT * FROM ${t}`);
      for (const row of res.rows) {
        const cols = Object.keys(row);
        const params = Object.values(row).map(v => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v));
        const placeholders = cols.map(() => '?').join(', ');
        const updateCols = cols.filter(c => !pks.includes(c)).map(c => `${c} = excluded.${c}`).join(', ');

        const conflictClause = updateCols.length > 0
          ? `ON CONFLICT (${pks.join(', ')}) DO UPDATE SET ${updateCols}`
          : `ON CONFLICT (${pks.join(', ')}) DO NOTHING`;

        const sql = `
          INSERT INTO ${t} (${cols.join(', ')})
          VALUES (${placeholders})
          ${conflictClause}
        `;
        sqliteDb.prepare(sql).run(...(params as any[]));
        totalPulled++;
      }
    }
    return { ok: true, totalPulled };
  } finally {
    client.release();
  }
}
