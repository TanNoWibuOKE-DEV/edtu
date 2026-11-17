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

async function main() {
  console.log('--- PROVISIONING STUDENT DATA FOR eDTU ---');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1. Get or create student user
  let user = sqliteDb.prepare('SELECT id FROM users WHERE user_code = ?').get('student') as { id: string } | undefined;
  const studentUserId = user ? user.id : id();

  if (!user) {
    const passHash = hashPassword('Student@123456');
    sqliteDb.prepare(`
      INSERT INTO users (id, user_code, full_name, email, password_hash, status, must_change_password, created_at, updated_at)
      VALUES (?, 'student', 'Nguyễn Văn Tân', 'nguyenvantan15082000@gmail.com', ?, 'active', 0, ?, ?)
    `).run(studentUserId, passHash, now, now);

    sqliteDb.prepare(`INSERT OR IGNORE INTO user_roles (id, user_id, role_id, is_primary, granted_at) VALUES (?, ?, 'student', 1, ?)`).run(id(), studentUserId, now);
    sqliteDb.prepare(`INSERT OR REPLACE INTO students (user_id, faculty_unit_id, major, cohort, enrollment_year) VALUES (?, 'unit-fac-cntt', 'Kỹ thuật Phần mềm (CMU)', 'K28', 2022)`).run(studentUserId);
  }

  // 2. Ensure Faculty & Courses exist
  sqliteDb.prepare(`INSERT OR IGNORE INTO university_units (id, code, name, unit_type) VALUES ('unit-fac-cntt', 'FIT', 'Khoa Công nghệ Thông tin', 'faculty')`).run();
  sqliteDb.prepare(`INSERT OR IGNORE INTO faculties (unit_id) VALUES ('unit-fac-cntt')`).run();

  const courses = [
    { id: 'crs-se301', code: 'SE301', name: 'Công nghệ Phần mềm Nâng cao (CMU)', credits: 3 },
    { id: 'crs-cs202', code: 'CS202', name: 'Cơ sở Dữ liệu & Hệ Quản trị CSDL', credits: 4 },
    { id: 'crs-web302', code: 'WEB302', name: 'Phát triển Ứng dụng Web Full-Stack', credits: 3 },
    { id: 'crs-net101', code: 'NET101', name: 'Mạng Máy tính & An toàn Thông tin', credits: 3 },
  ];

  for (const c of courses) {
    sqliteDb.prepare(`INSERT OR REPLACE INTO courses (id, code, name, credits, faculty_unit_id, status) VALUES (?, ?, ?, ?, 'unit-fac-cntt', 'active')`).run(c.id, c.code, c.name, c.credits);
  }

  // 3. Course sections
  const sections = [
    { id: 'sec-se301-01', course_id: 'crs-se301', code: 'SE301-K28A', term: 'HK1', academic_year: '2026-2027', room: 'F.301 - CS Hòa Khánh', weekday: 2, start_time: '07:30', end_time: '10:00' },
    { id: 'sec-cs202-01', course_id: 'crs-cs202', code: 'CS202-K28A', term: 'HK1', academic_year: '2026-2027', room: 'F.304 - CS Hòa Khánh', weekday: 3, start_time: '13:30', end_time: '16:00' },
    { id: 'sec-web302-01', course_id: 'crs-web302', code: 'WEB302-K28A', term: 'HK1', academic_year: '2026-2027', room: 'Lab F.402 - CS Hòa Khánh', weekday: 5, start_time: '08:00', end_time: '11:15' },
    { id: 'sec-net101-01', course_id: 'crs-net101', code: 'NET101-K28A', term: 'HK1', academic_year: '2026-2027', room: 'E.205 - CS Hòa Khánh', weekday: 6, start_time: '14:00', end_time: '16:30' },
  ];

  for (const s of sections) {
    sqliteDb.prepare(`INSERT INTO course_sections (id, course_id, code, term, academic_year, room, capacity, status)
      VALUES (?, ?, ?, ?, ?, ?, 45, 'open')
      ON CONFLICT(id) DO UPDATE SET code = excluded.code, room = excluded.room`).run(s.id, s.course_id, s.code, s.term, s.academic_year, s.room);
    sqliteDb.prepare(`DELETE FROM class_schedules WHERE section_id = ?`).run(s.id);
    sqliteDb.prepare(`INSERT INTO class_schedules (id, section_id, weekday, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?)`).run(id(), s.id, s.weekday, s.start_time, s.end_time, s.room);
  }

  // 4. Enroll student in all 4 sections
  for (const s of sections) {
    sqliteDb.prepare(`INSERT INTO enrollments (id, student_user_id, section_id, status, enrolled_at)
      VALUES (?, ?, ?, 'enrolled', ?)
      ON CONFLICT(student_user_id, section_id) DO UPDATE SET status = 'enrolled'`).run(id(), studentUserId, s.id, now);
  }

  // 5. Grade components & Student grades
  for (const s of sections) {
    const compChuyencanId = `comp-${s.id}-cc`;
    const compGiuaKyId = `comp-${s.id}-gk`;
    const compCuoiKyId = `comp-${s.id}-ck`;

    sqliteDb.prepare(`INSERT INTO grade_components (id, section_id, name, weight) VALUES (?, ?, 'Chuyên cần', 0.1)
      ON CONFLICT(section_id, name) DO NOTHING`).run(compChuyencanId, s.id);
    sqliteDb.prepare(`INSERT INTO grade_components (id, section_id, name, weight) VALUES (?, ?, 'Giữa kỳ', 0.3)
      ON CONFLICT(section_id, name) DO NOTHING`).run(compGiuaKyId, s.id);
    sqliteDb.prepare(`INSERT INTO grade_components (id, section_id, name, weight) VALUES (?, ?, 'Cuối kỳ', 0.6)
      ON CONFLICT(section_id, name) DO NOTHING`).run(compCuoiKyId, s.id);

    // Give student sample high grades (8.5 - 9.5)
    sqliteDb.prepare(`INSERT INTO grades (id, student_user_id, section_id, component_id, score, status, updated_at)
      VALUES (?, ?, ?, ?, 9.5, 'approved', ?)
      ON CONFLICT(student_user_id, section_id, component_id) DO UPDATE SET score = 9.5, status = 'approved'`).run(id(), studentUserId, s.id, compChuyencanId, now);
    sqliteDb.prepare(`INSERT INTO grades (id, student_user_id, section_id, component_id, score, status, updated_at)
      VALUES (?, ?, ?, ?, 9.0, 'approved', ?)
      ON CONFLICT(student_user_id, section_id, component_id) DO UPDATE SET score = 9.0, status = 'approved'`).run(id(), studentUserId, s.id, compGiuaKyId, now);
  }

  // 6. Tuition record & VietQR payments
  const tuitionId = 'tuition-hk1-2026';
  sqliteDb.prepare(`INSERT OR REPLACE INTO tuition_records (id, student_user_id, term, amount, due_at, status, created_at)
    VALUES (?, ?, 'Học kỳ 1 · 2026-2027', 14500000, '2026-12-15', 'paid', ?)`).run(tuitionId, studentUserId, now);

  sqliteDb.prepare(`DELETE FROM payment_transactions WHERE tuition_record_id = ?`).run(tuitionId);
  sqliteDb.prepare(`INSERT INTO payment_transactions (id, tuition_record_id, amount, reference_code, status, paid_at, created_at)
    VALUES (?, ?, 14500000, 'DTU-PAY-2026K28', 'verified', ?, ?)`).run(id(), tuitionId, now, now);

  // 7. University news announcements
  const adminUser = sqliteDb.prepare("SELECT id FROM users WHERE user_code = 'admin'").get() as { id: string } | undefined;
  const adminId = adminUser ? adminUser.id : studentUserId;

  sqliteDb.prepare(`DELETE FROM news WHERE title LIKE '%Học kỳ 1%' OR title LIKE '%Chào mừng%'`).run();
  sqliteDb.prepare(`INSERT INTO news (id, title, body, audience, published_by, published_at, created_at) VALUES
    (?, 'Chào mừng năm học mới 2026–2027 tại Đại học Duy Tân', 'Trường Đại học Duy Tân chào đón toàn thể sinh viên và tân sinh viên K28, K29 bước vào năm học mới. Chúc các bạn đạt kết quả học tập và rèn luyện xuất sắc.', 'all', ?, ?, ?)`).run(id(), adminId, now, now);
  sqliteDb.prepare(`INSERT INTO news (id, title, body, audience, published_by, published_at, created_at) VALUES
    (?, 'Thông báo lịch đăng ký môn học và thời khóa biểu HK1', 'Sinh viên các khoa lưu ý kiểm tra lịch học trên cổng eDTU. Các học phần chuẩn ABET đã mở đăng ký trực tuyến.', 'student', ?, ?, ?)`).run(id(), adminId, now, now);

  console.log('✓ SQLite provisioned successfully.');

  // 8. Sync to Supabase PostgreSQL
  console.log('Syncing to Supabase PostgreSQL...');
  const client = await pgPool.connect();
  try {
    await client.query(`INSERT INTO university_units (id, code, name, unit_type) VALUES ('unit-fac-cntt', 'FIT', 'Khoa Công nghệ Thông tin', 'faculty') ON CONFLICT (id) DO NOTHING`);
    await client.query(`INSERT INTO faculties (unit_id) VALUES ('unit-fac-cntt') ON CONFLICT (unit_id) DO NOTHING`);

    for (const c of courses) {
      await client.query(`INSERT INTO courses (id, code, name, credits, faculty_unit_id, status) VALUES ($1, $2, $3, $4, 'unit-fac-cntt', 'active')
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, credits = EXCLUDED.credits`, [c.id, c.code, c.name, c.credits]);
    }

    for (const s of sections) {
      await client.query(`INSERT INTO course_sections (id, course_id, code, term, academic_year, room, capacity, status) VALUES ($1, $2, $3, $4, $5, $6, 45, 'open')
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, room = EXCLUDED.room`, [s.id, s.course_id, s.code, s.term, s.academic_year, s.room]);
      await client.query(`DELETE FROM class_schedules WHERE section_id = $1`, [s.id]);
      await client.query(`INSERT INTO class_schedules (id, section_id, weekday, start_time, end_time, room) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id(), s.id, s.weekday, s.start_time, s.end_time, s.room]);
    }

    for (const s of sections) {
      await client.query(`INSERT INTO enrollments (id, student_user_id, section_id, status, enrolled_at) VALUES ($1, $2, $3, 'enrolled', $4)
        ON CONFLICT (student_user_id, section_id) DO UPDATE SET status = 'enrolled'`, [id(), studentUserId, s.id, now]);
    }

    console.log('✓ Supabase PostgreSQL synchronized successfully.');
  } catch (err: any) {
    console.error('PostgreSQL sync note:', err.message);
  } finally {
    client.release();
    await pgPool.end();
  }

  console.log('==============================================');
  console.log('TÀI KHOẢN SINH VIÊN ĐÃ ĐƯỢC THIẾT LẬP ĐẦY ĐỦ:');
  console.log('Tài khoản / Mã SV: student');
  console.log('Email: nguyenvantan15082000@gmail.com');
  console.log('Mật khẩu: Student@123456');
  console.log('Họ tên: Nguyễn Văn Tân');
  console.log('Ngành: Kỹ thuật Phần mềm (CMU) - Khóa K28');
  console.log('Lớp học phần: 4 môn học (SE301, CS202, WEB302, NET101)');
  console.log('Thời khóa biểu: Thứ 2, Thứ 3, Thứ 5, Thứ 6');
  console.log('==============================================');
}

void main();
