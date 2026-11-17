import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './data/edtu.sqlite');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

const id = () => randomUUID();

console.log('Seeding fake demo data for eDTU Portal...');

db.exec('BEGIN IMMEDIATE');

try {
  // Ensure all permissions exist and staff has full permissions for their modules
  const extraPerms = [
    ['staff.students.read_department', 'Tra cứu sinh viên theo phạm vi phòng ban'],
    ['staff.academic.manage', 'Xử lý nghiệp vụ đào tạo được cấp'],
    ['staff.finance.manage', 'Xử lý nghiệp vụ tài chính được cấp'],
    ['staff.requests.manage', 'Xử lý yêu cầu hỗ trợ được cấp'],
    ['staff.news.manage', 'Quản lý thông báo được cấp'],
    ['staff.tasks.read_assigned', 'Xem công việc được giao'],
    ['staff.profile.read_own', 'Xem hồ sơ nhân viên'],
    ['staff.reports.read_department', 'Xem báo cáo theo phòng ban'],
  ];

  for (const [permId, desc] of extraPerms) {
    db.prepare('INSERT OR IGNORE INTO permissions(id, description) VALUES (?, ?)').run(permId, desc);
  }

  // Grant all staff.* permissions to staff role
  db.exec(`INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
    SELECT 'staff', id FROM permissions WHERE id LIKE 'staff.%'`);

  // 1. UNIVERSITY UNITS (Faculties, Departments, Offices, Centers)
  const unitsData = [
    // Faculties
    { id: 'unit-fac-cntt', code: 'FIT', name: 'Khoa Công nghệ Thông tin', unit_type: 'faculty', parent_id: null },
    { id: 'unit-fac-ktqt', code: 'SBA', name: 'Khoa Kinh tế & Quản trị Kinh doanh', unit_type: 'faculty', parent_id: null },
    { id: 'unit-fac-nn', code: 'SFL', name: 'Khoa Ngoại ngữ', unit_type: 'faculty', parent_id: null },
    { id: 'unit-fac-dtt', code: 'SET', name: 'Khoa Điện - Điện tử', unit_type: 'faculty', parent_id: null },
    // Departments under FIT
    { id: 'unit-dep-se', code: 'FIT-SE', name: 'Bộ môn Kỹ thuật Phần mềm', unit_type: 'department', parent_id: 'unit-fac-cntt' },
    { id: 'unit-dep-cs', code: 'FIT-CS', name: 'Bộ môn Khoa học Máy tính & Dữ liệu', unit_type: 'department', parent_id: 'unit-fac-cntt' },
    { id: 'unit-dep-net', code: 'FIT-NET', name: 'Bộ môn Mạng máy tính & An ninh thông tin', unit_type: 'department', parent_id: 'unit-fac-cntt' },
    // Departments under SBA
    { id: 'unit-dep-ba', code: 'SBA-BA', name: 'Bộ môn Quản trị Kinh doanh', unit_type: 'department', parent_id: 'unit-fac-ktqt' },
    { id: 'unit-dep-af', code: 'SBA-AF', name: 'Bộ môn Tài chính - Kế toán', unit_type: 'department', parent_id: 'unit-fac-ktqt' },
    // Offices
    { id: 'unit-off-dt', code: 'AAO', name: 'Phòng Đào tạo Đại học', unit_type: 'office', parent_id: null },
    { id: 'unit-off-khtc', code: 'PFO', name: 'Phòng Kế hoạch - Tài chính', unit_type: 'office', parent_id: null },
    { id: 'unit-off-ctsv', code: 'SAO', name: 'Phòng Công tác Sinh viên', unit_type: 'office', parent_id: null },
    { id: 'unit-cen-ktdb', code: 'QAC', name: 'Trung tâm Khảo thí & Đảm bảo Chất lượng', unit_type: 'center', parent_id: null },
  ];

  for (const u of unitsData) {
    db.prepare(`INSERT OR REPLACE INTO university_units(id, code, name, unit_type, parent_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')`).run(u.id, u.code, u.name, u.unit_type, u.parent_id);

    if (u.unit_type === 'faculty') {
      db.prepare(`INSERT OR IGNORE INTO faculties(unit_id) VALUES (?)`).run(u.id);
    } else if (u.unit_type === 'department') {
      db.prepare(`INSERT OR REPLACE INTO departments(unit_id, faculty_unit_id) VALUES (?, ?)`).run(u.id, u.parent_id);
    }
  }

  // 2. POSITIONS
  const positionsData = [
    { id: 'pos-truongkhoa', code: 'DEAN', name: 'Trưởng khoa', unit_id: 'unit-fac-cntt' },
    { id: 'pos-photruongkhoa', code: 'V-DEAN', name: 'Phó Trưởng khoa', unit_id: 'unit-fac-cntt' },
    { id: 'pos-truongbomon', code: 'HOD', name: 'Trưởng Bộ môn', unit_id: 'unit-dep-se' },
    { id: 'pos-giangvien', code: 'LEC', name: 'Giảng viên Giảng dạy', unit_id: 'unit-fac-cntt' },
    { id: 'pos-truongphong-dt', code: 'HEAD-AAO', name: 'Trưởng phòng Đào tạo', unit_id: 'unit-off-dt' },
    { id: 'pos-chuyenvien-dt', code: 'SPEC-AAO', name: 'Chuyên viên Học vụ', unit_id: 'unit-off-dt' },
    { id: 'pos-chuyenvien-tc', code: 'SPEC-FIN', name: 'Chuyên viên Tài chính - Học phí', unit_id: 'unit-off-khtc' },
    { id: 'pos-chuyenvien-ctsv', code: 'SPEC-SAO', name: 'Chuyên viên Công tác Sinh viên', unit_id: 'unit-off-ctsv' },
  ];

  for (const p of positionsData) {
    db.prepare(`INSERT OR REPLACE INTO positions(id, code, name, unit_id) VALUES (?, ?, ?, ?)`).run(p.id, p.code, p.name, p.unit_id);
  }

  // 3. SEED CORE USERS
  const usersToSeed = [
    // 1. ADMIN
    {
      id: 'usr-admin-01',
      user_code: 'admin',
      full_name: 'TS. Nguyễn Hoàng Long',
      email: 'admin@duytan.edu.vn',
      password: 'Admin@123456',
      primaryRole: 'admin',
      roles: ['admin'],
    },
    // Update existing demo.admin if present
    {
      id: 'usr-admin-demo',
      user_code: 'demo.admin',
      full_name: 'eDTU Quản trị viên Demo',
      email: 'demo.admin@edtu.local',
      password: 'Admin@123456',
      primaryRole: 'admin',
      roles: ['admin'],
    },
    // 2. LECTURER
    {
      id: 'usr-lec-01',
      user_code: 'lecturer',
      full_name: 'TS. Trần Hoàng Việt',
      email: 'thviet@duytan.edu.vn',
      password: 'Lecturer@123456',
      primaryRole: 'lecturer',
      roles: ['lecturer'],
      faculty_unit_id: 'unit-fac-cntt',
      department_unit_id: 'unit-dep-se',
      academic_degree: 'Tiến sĩ Khoa học Máy tính',
      title: 'Phó Trưởng khoa CNTT',
      work_phone: '0236.3827111 - Ext 102',
    },
    {
      id: 'usr-lec-02',
      user_code: 'gv.maichi',
      full_name: 'ThS. Lê Mai Chi',
      email: 'lmchi@duytan.edu.vn',
      password: 'Lecturer@123456',
      primaryRole: 'lecturer',
      roles: ['lecturer'],
      faculty_unit_id: 'unit-fac-ktqt',
      department_unit_id: 'unit-dep-ba',
      academic_degree: 'Thạc sĩ Quản trị Kinh doanh (MBA)',
      title: 'Giảng viên chính',
      work_phone: '0236.3827111 - Ext 205',
    },
    // 3. STUDENT
    {
      id: 'usr-stu-01',
      user_code: 'student',
      full_name: 'Nguyễn Văn An',
      email: 'nguyenan.k28@duytan.edu.vn',
      password: 'Student@123456',
      primaryRole: 'student',
      roles: ['student'],
      faculty_unit_id: 'unit-fac-cntt',
      major: 'Kỹ thuật Phần mềm (Chuẩn CMU)',
      cohort: 'K28',
      enrollment_year: 2023,
    },
    {
      id: 'usr-stu-demo',
      user_code: 'demo.student',
      full_name: 'Demo Sinh viên',
      email: 'demo.student@edtu.local',
      password: 'Student@123456',
      primaryRole: 'student',
      roles: ['student'],
      faculty_unit_id: 'unit-fac-cntt',
      major: 'Khoa học Máy tính',
      cohort: 'K28',
      enrollment_year: 2023,
    },
    {
      id: 'usr-stu-02',
      user_code: 'sv.tranlinh',
      full_name: 'Trần Thảo Linh',
      email: 'thaolinh.k29@duytan.edu.vn',
      password: 'Student@123456',
      primaryRole: 'student',
      roles: ['student'],
      faculty_unit_id: 'unit-fac-cntt',
      major: 'An toàn Thông tin',
      cohort: 'K29',
      enrollment_year: 2024,
    },
    {
      id: 'usr-stu-03',
      user_code: 'sv.minhduc',
      full_name: 'Hoàng Minh Đức',
      email: 'minhduc.k28@duytan.edu.vn',
      password: 'Student@123456',
      primaryRole: 'student',
      roles: ['student'],
      faculty_unit_id: 'unit-fac-cntt',
      major: 'Trí tuệ Nhân tạo & Khoa học Dữ liệu',
      cohort: 'K28',
      enrollment_year: 2023,
    },
    // 4. STAFF
    {
      id: 'usr-staff-01',
      user_code: 'staff',
      full_name: 'Phạm Phương Thảo',
      email: 'ppthao@duytan.edu.vn',
      password: 'Staff@123456',
      primaryRole: 'staff',
      roles: ['staff'],
      unit_id: 'unit-off-dt',
      department_unit_id: null,
      position_id: 'pos-chuyenvien-dt',
      work_phone: '0236.3827111 - Ext 115',
    },
    {
      id: 'usr-staff-02',
      user_code: 'nv.ducquang',
      full_name: 'Vũ Đức Quang',
      email: 'vdquang@duytan.edu.vn',
      password: 'Staff@123456',
      primaryRole: 'staff',
      roles: ['staff'],
      unit_id: 'unit-off-khtc',
      department_unit_id: null,
      position_id: 'pos-chuyenvien-tc',
      work_phone: '0236.3827111 - Ext 118',
    },
    // 5. DUAL ROLE (Lecturer & Admin)
    {
      id: 'usr-dual-01',
      user_code: 'user.dual',
      full_name: 'PGS.TS Vũ Đình Khoa',
      email: 'vdkhoa@duytan.edu.vn',
      password: 'Dual@123456',
      primaryRole: 'lecturer',
      roles: ['lecturer', 'admin'],
      faculty_unit_id: 'unit-fac-cntt',
      department_unit_id: 'unit-dep-cs',
      academic_degree: 'Phó Giáo sư, Tiến sĩ',
      title: 'Giảng viên Cao cấp',
      work_phone: '0236.3827111 - Ext 101',
    },
  ];

  for (const u of usersToSeed) {
    const existing = db.prepare('SELECT id FROM users WHERE user_code = ? COLLATE NOCASE').get(u.user_code) as { id: string } | undefined;
    const userId = existing ? existing.id : u.id;

    db.prepare(`INSERT INTO users(id, user_code, full_name, email, password_hash, status, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, datetime('now', '-30 days'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        full_name=excluded.full_name,
        email=excluded.email,
        password_hash=excluded.password_hash,
        status='active',
        must_change_password=0,
        updated_at=datetime('now')
      ON CONFLICT(user_code) DO UPDATE SET
        full_name=excluded.full_name,
        email=excluded.email,
        password_hash=excluded.password_hash,
        status='active',
        must_change_password=0,
        updated_at=datetime('now')
    `).run(userId, u.user_code, u.full_name, u.email, hashPassword(u.password));

    // Assign roles
    for (const r of u.roles) {
      const isPrimary = r === u.primaryRole ? 1 : 0;
      db.prepare(`INSERT INTO user_roles(id, user_id, role_id, is_primary, granted_at)
        VALUES (?, ?, ?, ?, datetime('now', '-30 days'))
        ON CONFLICT(user_id, role_id) DO UPDATE SET is_primary=excluded.is_primary, revoked_at=NULL`).run(id(), userId, r, isPrimary);
    }

    // Role-specific records
    if (u.roles.includes('student')) {
      db.prepare(`INSERT INTO students(user_id, faculty_unit_id, major, cohort, enrollment_year)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          faculty_unit_id=excluded.faculty_unit_id,
          major=excluded.major,
          cohort=excluded.cohort,
          enrollment_year=excluded.enrollment_year`).run(userId, u.faculty_unit_id ?? null, u.major ?? null, u.cohort ?? null, u.enrollment_year ?? null);
    }
    if (u.roles.includes('lecturer')) {
      db.prepare(`INSERT INTO lecturers(user_id, faculty_unit_id, department_unit_id, academic_degree, title, work_phone)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          faculty_unit_id=excluded.faculty_unit_id,
          department_unit_id=excluded.department_unit_id,
          academic_degree=excluded.academic_degree,
          title=excluded.title,
          work_phone=excluded.work_phone`).run(userId, u.faculty_unit_id ?? null, u.department_unit_id ?? null, u.academic_degree ?? null, u.title ?? null, u.work_phone ?? null);
    }
    if (u.roles.includes('staff')) {
      db.prepare(`INSERT INTO staff(user_id, unit_id, department_unit_id, position_id, work_phone)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          unit_id=excluded.unit_id,
          department_unit_id=excluded.department_unit_id,
          position_id=excluded.position_id,
          work_phone=excluded.work_phone`).run(userId, u.unit_id ?? null, u.department_unit_id ?? null, u.position_id ?? null, u.work_phone ?? null);
    }
  }

  // Get actual user IDs for relational wiring
  const getUserId = (code: string) => (db.prepare('SELECT id FROM users WHERE user_code = ? COLLATE NOCASE').get(code) as { id: string })?.id;

  const adminId = getUserId('admin') || 'usr-admin-01';
  const lecVietId = getUserId('lecturer') || 'usr-lec-01';
  const lecChiId = getUserId('gv.maichi') || 'usr-lec-02';
  const stuAnId = getUserId('student') || 'usr-stu-01';
  const stuLinhId = getUserId('sv.tranlinh') || 'usr-stu-02';
  const stuDucId = getUserId('sv.minhduc') || 'usr-stu-03';
  const staffThaoId = getUserId('staff') || 'usr-staff-01';
  const staffQuangId = getUserId('nv.ducquang') || 'usr-staff-02';

  // 4. DATA SCOPES FOR STAFF
  db.prepare(`INSERT OR REPLACE INTO data_scopes(id, user_id, role_id, resource, scope_type, scope_id, granted_by)
    VALUES (?, ?, 'staff', 'students', 'all', NULL, ?)`).run('ds-staff-stu-all', staffThaoId, adminId);
  db.prepare(`INSERT OR REPLACE INTO data_scopes(id, user_id, role_id, resource, scope_type, scope_id, granted_by)
    VALUES (?, ?, 'staff', 'requests', 'all', NULL, ?)`).run('ds-staff-req-all', staffThaoId, adminId);

  // 5. COURSES
  const coursesData = [
    { id: 'crs-cs101', code: 'CS101', name: 'Lập trình Hướng đối tượng (OOP & C++)', credits: 3, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-cs202', code: 'CS202', name: 'Cấu trúc Dữ liệu & Giải thuật', credits: 4, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-cs303', code: 'CS303', name: 'Cơ sở Dữ liệu Nâng cao (SQL & NoSQL)', credits: 3, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-se401', code: 'SE401', name: 'Kiến trúc & Công nghệ Phần mềm Chuyên sâu', credits: 3, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-ai201', code: 'AI201', name: 'Nhập môn Trí tuệ Nhân tạo & Machine Learning', credits: 3, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-net102', code: 'NET102', name: 'Mạng Máy tính Căn bản & Giao thức Mạng', credits: 3, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-eng101', code: 'ENG101', name: 'Tiếng Anh Chuyên ngành CNTT 1', credits: 3, faculty_unit_id: 'unit-fac-nn' },
    { id: 'crs-math101', code: 'MATH101', name: 'Toán Rời rạc & Đại số Tuyến tính', credits: 3, faculty_unit_id: 'unit-fac-cntt' },
    { id: 'crs-ba201', code: 'BA201', name: 'Nguyên lý Tiếp thị & Digital Marketing', credits: 3, faculty_unit_id: 'unit-fac-ktqt' },
    { id: 'crs-ec101', code: 'EC101', name: 'Kinh tế Vi mô Đại cương', credits: 3, faculty_unit_id: 'unit-fac-ktqt' },
  ];

  for (const c of coursesData) {
    db.prepare(`INSERT OR REPLACE INTO courses(id, code, name, credits, faculty_unit_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')`).run(c.id, c.code, c.name, c.credits, c.faculty_unit_id);
  }

  // 6. ENROLLMENT PERIODS (Current open period + past closed period)
  db.prepare(`INSERT OR REPLACE INTO enrollment_periods(id, term, academic_year, starts_at, ends_at, status, created_by)
    VALUES (?, 'Học kỳ 1', '2026–2027', '2026-08-01 00:00:00', '2027-02-28 23:59:59', 'open', ?)`).run('ep-2026-hk1', adminId);

  db.prepare(`INSERT OR REPLACE INTO enrollment_periods(id, term, academic_year, starts_at, ends_at, status, created_by)
    VALUES (?, 'Học kỳ 2', '2025–2026', '2026-01-01 00:00:00', '2026-06-30 23:59:59', 'closed', ?)`).run('ep-2025-hk2', adminId);

  // 7. COURSE SECTIONS (Classes for Term 1, 2026–2027)
  const sectionsData = [
    { id: 'sec-cs101-01', course_id: 'crs-cs101', code: 'CS101.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'F.402 (Cơ sở Hòa Khánh Nam)', capacity: 45, status: 'open' },
    { id: 'sec-cs101-02', course_id: 'crs-cs101', code: 'CS101.02', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'F.403 (Cơ sở Hòa Khánh Nam)', capacity: 45, status: 'open' },
    { id: 'sec-cs303-01', course_id: 'crs-cs303', code: 'CS303.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'Lab CNTT 02 (Khu F)', capacity: 40, status: 'open' },
    { id: 'sec-se401-01', course_id: 'crs-se401', code: 'SE401.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'E.305 (Cơ sở Quang Trung)', capacity: 50, status: 'open' },
    { id: 'sec-ai201-01', course_id: 'crs-ai201', code: 'AI201.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'F.501 (Phòng AI & Big Data)', capacity: 45, status: 'open' },
    { id: 'sec-net102-01', course_id: 'crs-net102', code: 'NET102.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'Cisco Lab 01', capacity: 35, status: 'open' },
    { id: 'sec-eng101-01', course_id: 'crs-eng101', code: 'ENG101.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'A.201 (Cơ sở 03 Quang Trung)', capacity: 35, status: 'open' },
    { id: 'sec-math101-01', course_id: 'crs-math101', code: 'MATH101.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'B.102 (Hội trường B)', capacity: 60, status: 'open' },
    { id: 'sec-ba201-01', course_id: 'crs-ba201', code: 'BA201.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'K.301 (Cơ sở Phan Thanh)', capacity: 50, status: 'open' },
    { id: 'sec-cs202-01', course_id: 'crs-cs202', code: 'CS202.01', term: 'Học kỳ 1', academic_year: '2026–2027', room: 'F.302 (Cơ sở Hòa Khánh Nam)', capacity: 45, status: 'open' },
  ];

  for (const s of sectionsData) {
    db.prepare(`INSERT OR REPLACE INTO course_sections(id, course_id, code, term, academic_year, room, capacity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, s.course_id, s.code, s.term, s.academic_year, s.room, s.capacity, s.status);
  }

  // 8. LECTURER ASSIGNMENTS
  const lecturerAssignments = [
    { id: 'lca-01', lecturer_user_id: lecVietId, section_id: 'sec-cs101-01' },
    { id: 'lca-02', lecturer_user_id: lecVietId, section_id: 'sec-cs303-01' },
    { id: 'lca-03', lecturer_user_id: lecVietId, section_id: 'sec-se401-01' },
    { id: 'lca-04', lecturer_user_id: lecChiId, section_id: 'sec-ba201-01' },
  ];

  for (const la of lecturerAssignments) {
    db.prepare(`INSERT OR REPLACE INTO lecturer_course_assignments(id, lecturer_user_id, section_id, assigned_by)
      VALUES (?, ?, ?, ?)`).run(la.id, la.lecturer_user_id, la.section_id, adminId);
  }

  // 9. CLASS SCHEDULES (Timetable)
  // weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
  const schedulesData = [
    // CS101.01: Mon 07:30-10:45 & Wed 07:30-09:50
    { id: 'sch-01', section_id: 'sec-cs101-01', weekday: 1, start_time: '07:30', end_time: '10:45', room: 'F.402' },
    { id: 'sch-02', section_id: 'sec-cs101-01', weekday: 3, start_time: '07:30', end_time: '09:50', room: 'F.402' },
    // CS303.01: Tue 13:00-16:15
    { id: 'sch-03', section_id: 'sec-cs303-01', weekday: 2, start_time: '13:00', end_time: '16:15', room: 'Lab CNTT 02' },
    // SE401.01: Thu 08:15-11:30
    { id: 'sch-04', section_id: 'sec-se401-01', weekday: 4, start_time: '08:15', end_time: '11:30', room: 'E.305' },
    // ENG101.01: Fri 07:30-10:45
    { id: 'sch-05', section_id: 'sec-eng101-01', weekday: 5, start_time: '07:30', end_time: '10:45', room: 'A.201' },
    // AI201.01: Sat 08:15-11:30
    { id: 'sch-06', section_id: 'sec-ai201-01', weekday: 6, start_time: '08:15', end_time: '11:30', room: 'F.501' },
    // BA201.01: Wed 13:00-16:15
    { id: 'sch-07', section_id: 'sec-ba201-01', weekday: 3, start_time: '13:00', end_time: '16:15', room: 'K.301' },
  ];

  for (const sch of schedulesData) {
    db.prepare(`INSERT OR REPLACE INTO class_schedules(id, section_id, weekday, start_time, end_time, room)
      VALUES (?, ?, ?, ?, ?, ?)`).run(sch.id, sch.section_id, sch.weekday, sch.start_time, sch.end_time, sch.room);
  }

  // 10. ENROLLMENTS
  // Student An is enrolled in: CS101.01, CS303.01, SE401.01, ENG101.01
  const studentEnrollments = [
    { id: 'enr-an-cs101', student_user_id: stuAnId, section_id: 'sec-cs101-01' },
    { id: 'enr-an-cs303', student_user_id: stuAnId, section_id: 'sec-cs303-01' },
    { id: 'enr-an-se401', student_user_id: stuAnId, section_id: 'sec-se401-01' },
    { id: 'enr-an-eng101', student_user_id: stuAnId, section_id: 'sec-eng101-01' },
    // Student Linh enrolled in CS101.01, CS303.01
    { id: 'enr-linh-cs101', student_user_id: stuLinhId, section_id: 'sec-cs101-01' },
    { id: 'enr-linh-cs303', student_user_id: stuLinhId, section_id: 'sec-cs303-01' },
    // Student Duc enrolled in CS101.01, SE401.01
    { id: 'enr-duc-cs101', student_user_id: stuDucId, section_id: 'sec-cs101-01' },
    { id: 'enr-duc-se401', student_user_id: stuDucId, section_id: 'sec-se401-01' },
  ];

  for (const enr of studentEnrollments) {
    db.prepare(`INSERT OR REPLACE INTO enrollments(id, student_user_id, section_id, status)
      VALUES (?, ?, ?, 'enrolled')`).run(enr.id, enr.student_user_id, enr.section_id);
  }

  // 11. GRADE COMPONENTS (for CS101.01, CS303.01, SE401.01, ENG101.01)
  const sectionsForGrades = ['sec-cs101-01', 'sec-cs303-01', 'sec-se401-01', 'sec-eng101-01'];
  const componentsDefinition = [
    { name: 'Chuyên cần & Thái độ', weight: 0.1 },
    { name: 'Thực hành Lab & Bài tập', weight: 0.2 },
    { name: 'Kiểm tra Giữa kỳ', weight: 0.2 },
    { name: 'Thi Kết thúc học phần', weight: 0.5 },
  ];

  for (const secId of sectionsForGrades) {
    for (const comp of componentsDefinition) {
      db.prepare(`INSERT OR REPLACE INTO grade_components(id, section_id, name, weight)
        VALUES (?, ?, ?, ?)`).run(`gc-${secId}-${comp.name}`, secId, comp.name, comp.weight);
    }
  }

  // 12. GRADES
  // For Student An:
  // CS101.01: Approved grades
  const anCs101Scores = [
    { comp: 'Chuyên cần & Thái độ', score: 9.5, status: 'approved' },
    { comp: 'Thực hành Lab & Bài tập', score: 9.0, status: 'approved' },
    { comp: 'Kiểm tra Giữa kỳ', score: 8.5, status: 'approved' },
    { comp: 'Thi Kết thúc học phần', score: 8.8, status: 'approved' },
  ];
  for (const g of anCs101Scores) {
    db.prepare(`INSERT OR REPLACE INTO grades(id, student_user_id, section_id, component_id, score, status, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      `grd-an-cs101-${g.comp}`, stuAnId, 'sec-cs101-01', `gc-sec-cs101-01-${g.comp}`, g.score, g.status, lecVietId,
    );
  }

  // CS303.01: Approved grades
  const anCs303Scores = [
    { comp: 'Chuyên cần & Thái độ', score: 10.0, status: 'approved' },
    { comp: 'Thực hành Lab & Bài tập', score: 8.5, status: 'approved' },
    { comp: 'Kiểm tra Giữa kỳ', score: 8.0, status: 'approved' },
    { comp: 'Thi Kết thúc học phần', score: 8.5, status: 'approved' },
  ];
  for (const g of anCs303Scores) {
    db.prepare(`INSERT OR REPLACE INTO grades(id, student_user_id, section_id, component_id, score, status, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      `grd-an-cs303-${g.comp}`, stuAnId, 'sec-cs303-01', `gc-sec-cs303-01-${g.comp}`, g.score, g.status, lecVietId,
    );
  }

  // SE401.01: Draft/Submitted scores to show lecturer grading in action
  const se401Students = [
    { stuId: stuAnId, scores: [9.0, 8.5, 8.0, null], status: 'draft' },
    { stuId: stuDucId, scores: [8.0, 7.5, 7.0, null], status: 'draft' },
  ];
  for (const s of se401Students) {
    componentsDefinition.forEach((comp, idx) => {
      const score = s.scores[idx];
      db.prepare(`INSERT OR REPLACE INTO grades(id, student_user_id, section_id, component_id, score, status, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        `grd-se401-${s.stuId}-${comp.name}`, s.stuId, 'sec-se401-01', `gc-sec-se401-01-${comp.name}`, score, s.status, lecVietId,
      );
    });
  }

  // 13. GRADE APPROVAL REQUESTS & ADJUSTMENTS
  db.prepare(`INSERT OR REPLACE INTO grade_approval_requests(id, section_id, requested_by, status, note, created_at)
    VALUES (?, 'sec-cs101-01', ?, 'approved', 'Bảng điểm tổng kết học phần CS101.01 đã hoàn tất chấm và rà soát.', datetime('now', '-5 days'))`)
    .run('gar-cs101-01', lecVietId);

  db.prepare(`INSERT OR REPLACE INTO grade_approval_requests(id, section_id, requested_by, status, note, created_at)
    VALUES (?, 'sec-cs303-01', ?, 'pending', 'Gửi phê duyệt bảng điểm CS303.01 đợt 1 để kịp tiến độ học vụ.', datetime('now', '-1 day'))`)
    .run('gar-cs303-01', lecVietId);

  // Grade adjustment request for demo approval
  db.prepare(`INSERT OR REPLACE INTO grade_adjustment_requests(id, grade_id, requested_by, old_score, proposed_score, reason, status, created_at)
    VALUES (?, 'grd-an-cs303-Kiểm tra Giữa kỳ', ?, 8.0, 8.5, 'Sinh viên có nộp bổ sung phần tối ưu Index nâng cao được duyệt tại buổi thực hành.', 'pending', datetime('now', '-1 day'))`)
    .run('adj-01', lecVietId);

  // 14. ASSIGNMENTS
  const assignmentsData = [
    {
      id: 'asg-01',
      section_id: 'sec-cs101-01',
      title: 'Assignment 01: Thiết kế Lớp trừu tượng và Đa hình trong C++',
      description: 'Cài đặt hệ thống quản lý nhân sự ngân hàng áp dụng đầy đủ tính kế thừa, bao đóng, đa hình và mẫu thiết kế Factory Pattern. Nộp mã nguồn kèm file báo cáo PDF.',
      due_at: '2026-12-15 23:59:00',
      created_by: lecVietId,
    },
    {
      id: 'asg-02',
      section_id: 'sec-cs303-01',
      title: 'Lab 03: Tối ưu hóa Câu lệnh SQL & Thiết kế CSDL NoSQL MongoDB',
      description: 'Viết các câu truy vấn phức tạp trên cơ sở dữ liệu bán hàng trực tuyến lớn, phân tích Query Execution Plan và benchmark chỉ mục B-Tree vs Clustered Index.',
      due_at: '2026-12-20 23:59:00',
      created_by: lecVietId,
    },
    {
      id: 'asg-03',
      section_id: 'sec-se401-01',
      title: 'Đồ án Nhóm: Thiết kế Kiến trúc Microservices cho Sàn TMĐT eDTU',
      description: 'Lựa chọn kiến trúc Microservices kết hợp Event-Driven (Apache Kafka / RabbitMQ). Vẽ sơ đồ kiến trúc C4 Model và thuyết minh thiết kế API Gateway.',
      due_at: '2026-12-28 23:59:00',
      created_by: lecVietId,
    },
  ];

  for (const asg of assignmentsData) {
    db.prepare(`INSERT OR REPLACE INTO assignments(id, section_id, title, description, due_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?)`).run(asg.id, asg.section_id, asg.title, asg.description, asg.due_at, asg.created_by);
  }

  // Submissions
  db.prepare(`INSERT OR REPLACE INTO assignment_submissions(id, assignment_id, student_user_id, file_url, submitted_at, score, feedback, graded_by, graded_at)
    VALUES (?, 'asg-01', ?, 'https://storage.duytan.edu.vn/submissions/k28/cs101_asm1_nguyenan.zip', datetime('now', '-7 days'), 9.5, 'Bài làm rất tốt, áp dụng Factory Pattern chuẩn mực, cấu trúc mã nguồn sạch sẽ.', ?, datetime('now', '-3 days'))`)
    .run('sub-01', stuAnId, lecVietId);

  db.prepare(`INSERT OR REPLACE INTO assignment_submissions(id, assignment_id, student_user_id, file_url, submitted_at, score, feedback, graded_by, graded_at)
    VALUES (?, 'asg-02', ?, 'https://storage.duytan.edu.vn/submissions/k28/cs303_lab3_nguyenan.pdf', datetime('now', '-2 days'), NULL, NULL, NULL, NULL)`)
    .run('sub-02', stuAnId);

  // 15. COURSE DOCUMENTS & SYLLABUS
  const docsData = [
    { id: 'doc-01', section_id: 'sec-cs101-01', title: 'Đề cương chi tiết học phần CS101 (Syllabus 2026)', document_type: 'syllabus', file_url: 'https://duytan.edu.vn/syllabus/CS101_OOP_2026.pdf', uploaded_by: lecVietId },
    { id: 'doc-02', section_id: 'sec-cs101-01', title: 'Slide Bài giảng Chương 1 - 4: OOP Fundamentals & Patterns', document_type: 'slides', file_url: 'https://duytan.edu.vn/lectures/CS101_Slides_Part1.pdf', uploaded_by: lecVietId },
    { id: 'doc-03', section_id: 'sec-cs303-01', title: 'Giáo trình Cơ sở Dữ liệu Nâng cao (NXB Đại học Duy Tân)', document_type: 'textbook', file_url: 'https://duytan.edu.vn/ebooks/Advanced_Databases_DTU.pdf', uploaded_by: lecVietId },
    { id: 'doc-04', section_id: 'sec-se401-01', title: 'Tài liệu hướng dẫn thực hành Kiến trúc Microservices', document_type: 'reference', file_url: 'https://duytan.edu.vn/docs/Microservices_Practice_Guide.pdf', uploaded_by: lecVietId },
  ];

  for (const d of docsData) {
    db.prepare(`INSERT OR REPLACE INTO course_documents(id, section_id, title, document_type, file_url, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)`).run(d.id, d.section_id, d.title, d.document_type, d.file_url, d.uploaded_by);
  }

  // 16. ATTENDANCE SESSIONS & ATTENDANCE
  db.prepare(`INSERT OR REPLACE INTO attendance_sessions(id, section_id, held_at, created_by, note)
    VALUES (?, 'sec-cs101-01', datetime('now', '-14 days'), ?, 'Buổi 01: Giới thiệu môn học & Hướng dẫn cài đặt IDE Visual Studio')`).run('att-sess-01', lecVietId);
  db.prepare(`INSERT OR REPLACE INTO attendance_sessions(id, section_id, held_at, created_by, note)
    VALUES (?, 'sec-cs101-01', datetime('now', '-7 days'), ?, 'Buổi 02: Các nguyên lý cốt lõi OOP & Đa hình nâng cao')`).run('att-sess-02', lecVietId);
  db.prepare(`INSERT OR REPLACE INTO attendance_sessions(id, section_id, held_at, created_by, note)
    VALUES (?, 'sec-cs303-01', datetime('now', '-3 days'), ?, 'Buổi thực hành Lab 02: Tối ưu hóa chỉ mục Index')`).run('att-sess-03', lecVietId);

  // Mark attendance for Student An
  db.prepare(`INSERT OR REPLACE INTO attendance(id, session_id, student_user_id, status, note, marked_by)
    VALUES (?, 'att-sess-01', ?, 'present', 'Có mặt đúng giờ', ?)`).run('att-rec-01', stuAnId, lecVietId);
  db.prepare(`INSERT OR REPLACE INTO attendance(id, session_id, student_user_id, status, note, marked_by)
    VALUES (?, 'att-sess-02', ?, 'present', 'Tích cực phát biểu xây dựng bài', ?)`).run('att-rec-02', stuAnId, lecVietId);
  db.prepare(`INSERT OR REPLACE INTO attendance(id, session_id, student_user_id, status, note, marked_by)
    VALUES (?, 'att-sess-03', ?, 'present', 'Hoàn thành bài Lab tại lớp', ?)`).run('att-rec-03', stuAnId, lecVietId);

  // Mark attendance for Linh
  db.prepare(`INSERT OR REPLACE INTO attendance(id, session_id, student_user_id, status, note, marked_by)
    VALUES (?, 'att-sess-01', ?, 'present', 'Có mặt', ?)`).run('att-rec-04', stuLinhId, lecVietId);
  db.prepare(`INSERT OR REPLACE INTO attendance(id, session_id, student_user_id, status, note, marked_by)
    VALUES (?, 'att-sess-02', ?, 'late', 'Muộn 15 phút do kẹt xe', ?)`).run('att-rec-05', stuLinhId, lecVietId);

  // 17. TUITION RECORDS & PAYMENT TRANSACTIONS
  // Term 2 2025-2026: Paid
  db.prepare(`INSERT OR REPLACE INTO tuition_records(id, student_user_id, term, amount, due_at, status, created_at)
    VALUES (?, ?, 'Học kỳ 2 (2025–2026)', 13500000, '2026-03-31', 'paid', datetime('now', '-180 days'))`)
    .run('tui-01', stuAnId);

  db.prepare(`INSERT OR REPLACE INTO payment_transactions(id, tuition_record_id, amount, reference_code, status, paid_at, verified_by)
    VALUES (?, 'tui-01', 13500000, 'DTU-PAY-202603-9182', 'verified', '2026-03-25 14:32:00', ?)`).run('txn-01', staffQuangId);

  // Term 1 2026-2027: Unpaid or Partial
  db.prepare(`INSERT OR REPLACE INTO tuition_records(id, student_user_id, term, amount, due_at, status, created_at)
    VALUES (?, ?, 'Học kỳ 1 (2026–2027)', 14850000, '2026-12-31', 'unpaid', datetime('now', '-30 days'))`)
    .run('tui-02', stuAnId);

  // 18. STUDENT SUPPORT REQUESTS & TIMELINE
  db.prepare(`INSERT OR REPLACE INTO student_support_requests(id, student_user_id, category, subject, description, status, assigned_to, created_at, updated_at)
    VALUES (?, ?, 'Học vụ', 'Xin cấp Bảng điểm Tạm thời (Song ngữ Việt - Anh)', 'Kính gửi Phòng Đào tạo, em cần xin 02 bản bảng điểm tạm thời có đóng dấu xác nhận của nhà trường để nộp hồ sơ thực tập tại Công ty FPT Software Đà Nẵng.', 'in_progress', ?, datetime('now', '-3 days'), datetime('now', '-1 day'))`)
    .run('req-01', stuAnId, staffThaoId);

  db.prepare(`INSERT OR REPLACE INTO support_request_history(id, request_id, actor_user_id, old_status, new_status, note)
    VALUES (?, 'req-01', ?, 'new', 'in_progress', 'Đã tiếp nhận hồ sơ. Đang in bảng điểm và trình Ban Giám hiệu ký duyệt.')`)
    .run('req-hist-01', staffThaoId);

  db.prepare(`INSERT OR REPLACE INTO student_support_requests(id, student_user_id, category, subject, description, status, assigned_to, created_at, updated_at)
    VALUES (?, ?, 'Xác minh hồ sơ', 'Giấy xác nhận Sinh viên vay vốn ngân hàng chính sách', 'Em làm thủ tục vay vốn học tập theo chính sách của Ngân hàng Chính sách Xã hội huyện Điện Bàn, Quảng Nam.', 'completed', ?, datetime('now', '-15 days'), datetime('now', '-12 days'))`)
    .run('req-02', stuAnId, staffThaoId);

  db.prepare(`INSERT OR REPLACE INTO support_request_history(id, request_id, actor_user_id, old_status, new_status, note)
    VALUES (?, 'req-02', ?, 'in_progress', 'completed', 'Giấy xác nhận đã hoàn tất. Sinh viên vui lòng mang Thẻ sinh viên đến Bộ phận Một cửa (Tầng 1 - Cơ sở 254 Nguyễn Văn Linh) để nhận.')`)
    .run('req-hist-02', staffThaoId);

  // 19. INTERNAL TASKS FOR STAFF
  const tasksData = [
    { id: 'tsk-01', title: 'Rà soát danh sách sinh viên đủ điều kiện nhận Học bổng Khuyến khích Học kỳ 1', description: 'Kiểm tra điểm GPA >= 3.6 và điểm rèn luyện >= 85 của sinh viên Khoa CNTT và SBA.', assigned_to: staffThaoId, assigned_by: adminId, due_at: '2026-12-05 17:00:00', status: 'in_progress' },
    { id: 'tsk-02', title: 'Xử lý các đơn phúc khảo điểm thi học kỳ phụ đợt 2', description: 'Phối hợp với Trung tâm Khảo thí để đối chiếu bài thi và cập nhật điểm theo biên bản phúc khảo.', assigned_to: staffThaoId, assigned_by: adminId, due_at: '2026-12-10 17:00:00', status: 'new' },
    { id: 'tsk-03', title: 'Đối soát các giao dịch nộp học phí qua cổng ngân hàng VietinBank & BIDV', description: 'Kiểm tra khớp lệnh mã sinh viên và số tiền nộp tự động qua cổng VietQR.', assigned_to: staffQuangId, assigned_by: adminId, due_at: '2026-12-02 17:00:00', status: 'in_progress' },
  ];

  for (const t of tasksData) {
    db.prepare(`INSERT OR REPLACE INTO internal_tasks(id, title, description, assigned_to, assigned_by, status, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(t.id, t.title, t.description, t.assigned_to, t.assigned_by, t.status, t.due_at);
  }

  // 20. NEWS & ANNOUNCEMENTS
  const newsData = [
    {
      id: 'news-01',
      title: 'Thông báo Kế hoạch Đăng ký Môn học Học kỳ 1 năm học 2026 - 2027',
      body: 'Phòng Đào tạo Đại học Duy Tân thông báo thời gian mở cổng đăng ký học phần chính thức từ 08:00 ngày 15/08 đến hết ngày 30/12/2026. Sinh viên kiểm tra kỹ học phần tiên quyết, số tín chỉ đăng ký tối thiểu (14 TC) và tối đa (24 TC). Mọi vướng mắc về trùng lịch học, xin vui lòng gửi yêu cầu hỗ trợ trực tuyến qua cổng eDTU.',
      audience: 'all',
      published_by: adminId,
      published_at: '2026-08-15 08:00:00',
    },
    {
      id: 'news-02',
      title: 'Hội thảo Quốc tế DTU TechFest 2026: Trí tuệ Nhân tạo và Xu hướng Điện toán Đám mây',
      body: 'Đại học Duy Tân phối hợp cùng Microsoft, Google Cloud và FPT Software tổ chức ngày hội công nghệ lớn nhất miền Trung dành cho sinh viên và giảng viên khối ngành Kỹ thuật - Công nghệ. Tham gia để nhận chứng chỉ quốc tế và cơ hội phỏng vấn tuyển dụng trực tiếp tại gian hàng.',
      audience: 'all',
      published_by: adminId,
      published_at: '2026-09-10 09:30:00',
    },
    {
      id: 'news-03',
      title: 'Hướng dẫn Giảng viên nhập điểm quá trình và gửi phê duyệt Bảng điểm qua Cổng eDTU',
      body: 'Để chuẩn bị cho kỳ thi kết thúc học phần, quý Thầy/Cô vui lòng cập nhật đầy đủ điểm thành phần (Chuyên cần, Lab, Giữa kỳ) cho các lớp học phần được phân công trước ngày 25 hàng tháng. Chức năng Đề nghị điều chỉnh điểm đã được tích hợp tự động với lịch sử thay đổi để đảm bảo tính minh bạch.',
      audience: 'lecturer',
      published_by: adminId,
      published_at: '2026-10-01 14:00:00',
    },
    {
      id: 'news-04',
      title: 'Thông báo Học bổng Toàn phần & Bán phần dành cho Sinh viên Giỏi K28 - K29',
      body: 'Hội đồng Quản trị Đại học Duy Tân vừa phê duyệt quỹ học bổng trị giá 15 tỷ đồng cho năm học 2026 - 2027. Tiêu chuẩn xét học bổng: Điểm TBC học tập từ 3.6/4.0 trở lên, điểm rèn luyện từ 85 điểm, không có môn thi lại. Thời hạn nộp hồ sơ trực tuyến: Đến hết ngày 15/12/2026.',
      audience: 'student',
      published_by: adminId,
      published_at: '2026-10-15 10:00:00',
    },
    {
      id: 'news-05',
      title: 'Kế hoạch Nâng cấp Hệ thống Cổng Thông tin Điện tử eDTU 2.0',
      body: 'Phòng CNTT triển khai phiên bản eDTU Portal mới với giao diện hiện đại, tối ưu hóa trải nghiệm trên mọi thiết bị di động, phân quyền bảo mật nhiều lớp và tích hợp thanh toán học phí VietQR tự động. Các đơn vị phòng ban gửi góp ý hoàn thiện trước ngày 20/12/2026.',
      audience: 'staff',
      published_by: adminId,
      published_at: '2026-11-01 16:30:00',
    },
  ];

  for (const n of newsData) {
    db.prepare(`INSERT OR REPLACE INTO news(id, title, body, audience, published_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(n.id, n.title, n.body, n.audience, n.published_by, n.published_at);
  }

  // 21. AUDIT LOGS
  const auditLogs = [
    { action: 'auth.login', resource_type: 'user', resource_id: adminId, details: { user_code: 'admin', ip: '192.168.1.100' } },
    { action: 'enrollment_period.open', resource_type: 'enrollment_period', resource_id: 'ep-2026-hk1', details: { term: 'Học kỳ 1', academic_year: '2026–2027' } },
    { action: 'grade.submit', resource_type: 'grade_approval_request', resource_id: 'gar-cs101-01', details: { section: 'CS101.01', lecturer: 'TS. Trần Hoàng Việt' } },
    { action: 'grade.approve', resource_type: 'grade_approval_request', resource_id: 'gar-cs101-01', details: { decision: 'approved', approved_by: 'TS. Nguyễn Hoàng Long' } },
    { action: 'tuition.verify', resource_type: 'payment_transaction', resource_id: 'txn-01', details: { amount: 13500000, student: 'Nguyễn Văn An' } },
  ];

  for (const log of auditLogs) {
    db.prepare(`INSERT OR REPLACE INTO audit_logs(id, actor_user_id, active_role, action, resource_type, resource_id, details_json, ip_address, created_at)
      VALUES (?, ?, 'admin', ?, ?, ?, ?, '127.0.0.1', datetime('now', '-2 days'))`)
      .run(id(), adminId, log.action, log.resource_type, log.resource_id, JSON.stringify(log.details));
  }

  db.exec('COMMIT');
  console.log('Seed demo data completed successfully!');
} catch (error) {
  db.exec('ROLLBACK');
  console.error('Failed to seed demo data:', error);
  throw error;
}
