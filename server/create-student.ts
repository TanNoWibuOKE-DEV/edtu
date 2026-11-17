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

async function createStudent() {
  const studentId = id();
  const userCode = 'student';
  const fullName = 'Nguyễn Văn Tân';
  const email = 'nguyenvantan15082000@gmail.com';
  const password = 'Student@123456';
  const passHash = hashPassword(password);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  console.log('--- CREATING STUDENT IN LOCAL SQLITE ---');
  // Check if exists
  const existing = sqliteDb.prepare('SELECT id FROM users WHERE user_code = ? OR email = ?').get(userCode, email);
  if (existing) {
    sqliteDb.prepare('DELETE FROM users WHERE user_code = ? OR email = ?').run(userCode, email);
  }

  sqliteDb.prepare(`
    INSERT INTO users (id, user_code, full_name, email, password_hash, status, must_change_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)
  `).run(studentId, userCode, fullName, email, passHash, now, now);

  sqliteDb.prepare(`
    INSERT INTO user_roles (id, user_id, role_id, is_primary, granted_at)
    VALUES (?, ?, 'student', 1, ?)
  `).run(id(), studentId, now);

  sqliteDb.prepare(`
    INSERT INTO students (user_id, faculty_unit_id, major, cohort, enrollment_year)
    VALUES (?, 'unit-cntt', 'Kỹ thuật Phần mềm (CMU)', 'K28', 2022)
  `).run(studentId);

  console.log('✓ Student created in SQLite.');

  console.log('--- CREATING STUDENT IN SUPABASE CLOUD POSTGRESQL ---');
  const client = await pgPool.connect();
  try {
    await client.query('DELETE FROM users WHERE user_code = $1 OR email = $2', [userCode, email]);

    await client.query(`
      INSERT INTO users (id, user_code, full_name, email, password_hash, status, must_change_password, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'active', 0, $6, $6)
    `, [studentId, userCode, fullName, email, passHash, now]);

    await client.query(`
      INSERT INTO user_roles (id, user_id, role_id, is_primary, granted_at)
      VALUES ($1, $2, 'student', 1, $3)
    `, [id(), studentId, now]);

    await client.query(`
      INSERT INTO students (user_id, faculty_unit_id, major, cohort, enrollment_year)
      VALUES ($1, 'unit-cntt', 'Kỹ thuật Phần mềm (CMU)', 'K28', 2022)
    `, [studentId]);

    console.log('✓ Student created in Supabase PostgreSQL.');
  } finally {
    client.release();
    await pgPool.end();
  }

  console.log('====================================');
  console.log('STUDENT ACCOUNT CREATED SUCCESSFULLY:');
  console.log('Mã sinh viên / Username: student');
  console.log('Email: ' + email);
  console.log('Mật khẩu: ' + password);
  console.log('Họ và tên: ' + fullName);
  console.log('Khoa: Khoa Công nghệ Thông tin (K28 CMU)');
  console.log('====================================');
}

void createStudent();
