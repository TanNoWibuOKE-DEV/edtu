import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, id } from './security.js';

const sqliteDb = new DatabaseSync('data/edtu.sqlite');

const pgPool = new pg.Pool({
  host: 'db.zpenkfrgrosreaketgzr.supabase.co',
  port: 5432,
  user: 'postgres',
  password: '@@tan15082008##',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function resetAll() {
  console.log('--- RESETTING LOCAL SQLITE DATABASE ---');

  // List of operational tables to wipe completely
  const tablesToWipe = [
    'audit_logs',
    'sessions',
    'data_scopes',
    'news',
    'internal_tasks',
    'support_request_history',
    'student_support_requests',
    'payment_transactions',
    'tuition_records',
    'attendance',
    'attendance_sessions',
    'course_documents',
    'assignment_submissions',
    'assignments',
    'grade_adjustment_requests',
    'grade_change_logs',
    'grade_approval_requests',
    'grades',
    'grade_components',
    'enrollments',
    'class_schedules',
    'staff_department_assignments',
    'lecturer_course_assignments',
    'course_sections',
    'enrollment_periods',
    'courses',
    'staff',
    'lecturers',
    'students',
    'positions',
    'departments',
    'faculties',
    'university_units',
    'user_roles',
    'users',
  ];

  for (const t of tablesToWipe) {
    try {
      sqliteDb.exec(`DELETE FROM ${t}`);
    } catch (e: any) {
      console.warn(`Local wipe warning on ${t}:`, e.message);
    }
  }

  // Insert standard core units
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const coreUnits = [
    { id: 'unit-dtu', code: 'TRUONG-DTU', name: 'Trường Đại học Duy Tân', unit_type: 'other', parent_id: null },
    { id: 'unit-cntt', code: 'KHOA-CNTT', name: 'Khoa Công nghệ Thông tin', unit_type: 'faculty', parent_id: 'unit-dtu' },
    { id: 'unit-kt', code: 'KHOA-KT', name: 'Khoa Kinh tế & Quản trị', unit_type: 'faculty', parent_id: 'unit-dtu' },
    { id: 'unit-nn', code: 'KHOA-NN', name: 'Khoa Ngoại ngữ', unit_type: 'faculty', parent_id: 'unit-dtu' },
    { id: 'unit-dt', code: 'PHONG-DT', name: 'Phòng Đào tạo Đại học', unit_type: 'office', parent_id: 'unit-dtu' },
    { id: 'unit-khtc', code: 'PHONG-KHTC', name: 'Phòng Kế hoạch - Tài chính', unit_type: 'office', parent_id: 'unit-dtu' },
    { id: 'unit-ctsv', code: 'PHONG-CTSV', name: 'Phòng Công tác Sinh viên', unit_type: 'office', parent_id: 'unit-dtu' },
    { id: 'unit-ttcntt', code: 'TRUNGTAM-CNTT', name: 'Trung tâm Quản trị CNTT', unit_type: 'center', parent_id: 'unit-dtu' },
  ];

  for (const u of coreUnits) {
    sqliteDb.prepare(`
      INSERT INTO university_units (id, code, name, unit_type, parent_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(u.id, u.code, u.name, u.unit_type, u.parent_id, now);
  }

  // Insert faculties
  for (const fid of ['unit-cntt', 'unit-kt', 'unit-nn']) {
    sqliteDb.prepare(`INSERT INTO faculties (unit_id) VALUES (?)`).run(fid);
  }

  // Create single clean Administrator account
  const adminId = id();
  const adminPassHash = hashPassword('Admin@123456');

  sqliteDb.prepare(`
    INSERT INTO users (id, user_code, full_name, email, password_hash, status, must_change_password, created_at, updated_at)
    VALUES (?, 'admin', 'Quản trị viên Hệ thống', 'admin@duytan.edu.vn', ?, 'active', 0, ?, ?)
  `).run(adminId, adminPassHash, now, now);

  sqliteDb.prepare(`
    INSERT INTO user_roles (id, user_id, role_id, is_primary, granted_at)
    VALUES (?, ?, 'admin', 1, ?)
  `).run(id(), adminId, now);

  sqliteDb.prepare(`
    INSERT INTO staff (user_id, unit_id, work_phone)
    VALUES (?, 'unit-ttcntt', '0236.3827111')
  `).run(adminId);

  sqliteDb.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, active_role, action, resource_type, resource_id, details_json, created_at)
    VALUES (?, ?, 'admin', 'system.reset', 'database', 'clean', '{"message":"Hệ thống đã reset toàn bộ dữ liệu demo"}', ?)
  `).run(id(), adminId, now);

  console.log('✓ SQLite Database has been cleanly reset with 1 Admin account (admin / Admin@123456).');

  // Now wipe and mirror to Supabase Cloud PostgreSQL
  console.log('--- RESETTING SUPABASE CLOUD POSTGRESQL DATABASE ---');
  const pgClient = await pgPool.connect();
  try {
    await pgClient.query('BEGIN');
    for (const t of tablesToWipe) {
      await pgClient.query(`TRUNCATE TABLE ${t} CASCADE`);
    }

    // Insert core units
    for (const u of coreUnits) {
      await pgClient.query(`
        INSERT INTO university_units (id, code, name, unit_type, parent_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
      `, [u.id, u.code, u.name, u.unit_type, u.parent_id, now]);
    }

    for (const fid of ['unit-cntt', 'unit-kt', 'unit-nn']) {
      await pgClient.query(`INSERT INTO faculties (unit_id) VALUES ($1)`, [fid]);
    }

    // Insert Admin account
    await pgClient.query(`
      INSERT INTO users (id, user_code, full_name, email, password_hash, status, must_change_password, created_at, updated_at)
      VALUES ($1, 'admin', 'Quản trị viên Hệ thống', 'admin@duytan.edu.vn', $2, 'active', 0, $3, $3)
    `, [adminId, adminPassHash, now]);

    await pgClient.query(`
      INSERT INTO user_roles (id, user_id, role_id, is_primary, granted_at)
      VALUES ($1, $2, 'admin', 1, $3)
    `, [id(), adminId, now]);

    await pgClient.query(`
      INSERT INTO staff (user_id, unit_id, work_phone)
      VALUES ($1, 'unit-ttcntt', '0236.3827111')
    `, [adminId]);

    await pgClient.query(`
      INSERT INTO audit_logs (id, actor_user_id, active_role, action, resource_type, resource_id, details_json, created_at)
      VALUES ($1, $2, 'admin', 'system.reset', 'database', 'clean', '{"message":"Hệ thống đã reset toàn bộ dữ liệu demo"}', $3)
    `, [id(), adminId, now]);

    await pgClient.query('COMMIT');
    console.log('✓ Supabase Cloud PostgreSQL has been cleanly reset with 1 Admin account.');
  } catch (err: any) {
    await pgClient.query('ROLLBACK');
    console.error('Error resetting Supabase:', err.message);
  } finally {
    pgClient.release();
    await pgPool.end();
  }

  console.log('--- ALL FAKE DATA WIPED AND RESET SUCCESSFULLY ---');
}

void resetAll();
