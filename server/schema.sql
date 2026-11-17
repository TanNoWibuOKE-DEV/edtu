PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','pending')),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id),
  granted_by TEXT REFERENCES users(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  UNIQUE (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS data_scopes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('own','assigned','department','unit','all','record')),
  scope_id TEXT,
  granted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_role TEXT NOT NULL REFERENCES roles(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS university_units (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('faculty','department','office','center','other')),
  parent_id TEXT REFERENCES university_units(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faculties (
  unit_id TEXT PRIMARY KEY REFERENCES university_units(id) ON DELETE CASCADE,
  dean_user_id TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS departments (
  unit_id TEXT PRIMARY KEY REFERENCES university_units(id) ON DELETE CASCADE,
  faculty_unit_id TEXT REFERENCES faculties(unit_id)
);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_id TEXT REFERENCES university_units(id)
);

CREATE TABLE IF NOT EXISTS students (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  faculty_unit_id TEXT REFERENCES faculties(unit_id),
  major TEXT,
  cohort TEXT,
  enrollment_year INTEGER
);

CREATE TABLE IF NOT EXISTS lecturers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  faculty_unit_id TEXT REFERENCES faculties(unit_id),
  department_unit_id TEXT REFERENCES departments(unit_id),
  academic_degree TEXT,
  title TEXT,
  work_phone TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES university_units(id),
  department_unit_id TEXT REFERENCES departments(unit_id),
  position_id TEXT REFERENCES positions(id),
  work_phone TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  faculty_unit_id TEXT REFERENCES faculties(unit_id),
  syllabus_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);

CREATE TABLE IF NOT EXISTS course_sections (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  code TEXT NOT NULL UNIQUE,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  room TEXT,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','completed'))
);

CREATE TABLE IF NOT EXISTS enrollment_periods (
  id TEXT PRIMARY KEY,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open','closed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (term, academic_year)
);

CREATE TABLE IF NOT EXISTS lecturer_course_assignments (
  id TEXT PRIMARY KEY,
  lecturer_user_id TEXT NOT NULL REFERENCES lecturers(user_id),
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  assigned_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lecturer_user_id, section_id)
);

CREATE TABLE IF NOT EXISTS staff_department_assignments (
  id TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL REFERENCES staff(user_id),
  department_unit_id TEXT NOT NULL REFERENCES departments(unit_id),
  granted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (staff_user_id, department_unit_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES students(user_id),
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','dropped','completed')),
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_user_id, section_id)
);

CREATE TABLE IF NOT EXISTS class_schedules (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT,
  starts_on TEXT,
  ends_on TEXT
);

CREATE TABLE IF NOT EXISTS grade_components (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
  UNIQUE (section_id, name)
);

CREATE TABLE IF NOT EXISTS grades (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES students(user_id),
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  component_id TEXT NOT NULL REFERENCES grade_components(id),
  score REAL CHECK (score >= 0 AND score <= 10),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_user_id, section_id, component_id)
);

CREATE TABLE IF NOT EXISTS grade_approval_requests (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grade_change_logs (
  id TEXT PRIMARY KEY,
  grade_id TEXT NOT NULL REFERENCES grades(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  old_score REAL,
  new_score REAL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grade_adjustment_requests (
  id TEXT PRIMARY KEY,
  grade_id TEXT NOT NULL REFERENCES grades(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  old_score REAL,
  proposed_score REAL NOT NULL CHECK (proposed_score >= 0 AND proposed_score <= 10),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES students(user_id),
  file_url TEXT,
  submitted_at TEXT,
  score REAL CHECK (score >= 0 AND score <= 10),
  feedback TEXT,
  graded_by TEXT REFERENCES users(id),
  graded_at TEXT,
  UNIQUE (assignment_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS course_documents (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('syllabus','slides','textbook','reference','other')),
  file_url TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES course_sections(id),
  held_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  note TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES students(user_id),
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note TEXT,
  marked_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS internal_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT NOT NULL REFERENCES users(id),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  unit_id TEXT REFERENCES university_units(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting','completed','rejected')),
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_support_requests (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES students(user_id),
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting','completed','rejected')),
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_request_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES student_support_requests(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  is_internal INTEGER NOT NULL DEFAULT 0 CHECK (is_internal IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tuition_records (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES students(user_id),
  term TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','waived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  tuition_record_id TEXT NOT NULL REFERENCES tuition_records(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  paid_at TEXT,
  verified_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  published_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  active_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details_json TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_primary ON user_roles(user_id) WHERE is_primary = 1 AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_code_nocase ON users(user_code COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_nocase ON users(email COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_data_scopes_user ON data_scopes(user_id, role_id, resource);
CREATE INDEX IF NOT EXISTS idx_sections_term ON course_sections(academic_year, term);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_lecturer_assignments ON lecturer_course_assignments(lecturer_user_id, section_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_user_id, section_id);
CREATE INDEX IF NOT EXISTS idx_grade_adjustments_pending ON grade_adjustment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON internal_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_requests_status ON student_support_requests(status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

INSERT OR IGNORE INTO roles(id,name,label) VALUES
  ('student','student','Sinh viên'),
  ('lecturer','lecturer','Giảng viên'),
  ('staff','staff','Nhân viên'),
  ('admin','admin','Quản trị viên');

INSERT OR IGNORE INTO permissions(id,description) VALUES
  ('student.profile.read_own','Xem hồ sơ cá nhân'),
  ('student.schedule.read_own','Xem lịch học cá nhân'),
  ('student.grades.read_own','Xem điểm cá nhân'),
  ('student.tuition.read_own','Xem học phí cá nhân'),
  ('student.enrollment.create_own','Đăng ký học phần cá nhân'),
  ('student.requests.create_own','Tạo yêu cầu hỗ trợ cá nhân'),
  ('student.curriculum.read_own','Xem chương trình học cá nhân'),
  ('student.assignments.read_own','Xem bài tập cá nhân'),
  ('student.syllabus.read_own','Xem đề cương học phần'),
  ('student.payments.create_own','Tạo yêu cầu thanh toán cá nhân'),
  ('student.transactions.read_own','Xem lịch sử giao dịch cá nhân'),
  ('student.library.read','Tra cứu tài nguyên thư viện'),
  ('lecturer.classes.read_assigned','Xem lớp học phần được phân công'),
  ('lecturer.profile.read_own','Xem hồ sơ giảng viên'),
  ('lecturer.schedule.read_assigned','Xem lịch giảng dạy được phân công'),
  ('lecturer.news.read','Xem thông báo giảng viên'),
  ('lecturer.students.read_assigned','Xem sinh viên trong lớp được phân công'),
  ('lecturer.grades.manage_assigned','Quản lý điểm lớp được phân công'),
  ('lecturer.assignments.manage_assigned','Quản lý bài tập lớp được phân công'),
  ('lecturer.attendance.manage_assigned','Quản lý điểm danh lớp được phân công'),
  ('staff.students.read_department','Tra cứu sinh viên theo phạm vi phòng ban'),
  ('staff.academic.manage','Xử lý nghiệp vụ đào tạo được cấp'),
  ('staff.finance.manage','Xử lý nghiệp vụ tài chính được cấp'),
  ('staff.requests.manage','Xử lý yêu cầu hỗ trợ được cấp'),
  ('staff.news.manage','Quản lý thông báo được cấp'),
  ('staff.tasks.read_assigned','Xem công việc được giao'),
  ('staff.profile.read_own','Xem hồ sơ nhân viên'),
  ('staff.reports.read_department','Xem báo cáo theo phòng ban'),
  ('admin.users.read','Tra cứu tài khoản'),
  ('admin.users.manage','Quản lý tài khoản'),
  ('admin.roles.manage','Quản lý vai trò và quyền'),
  ('admin.units.manage','Quản lý khoa và đơn vị'),
  ('admin.system.manage','Quản lý cấu hình hệ thống'),
  ('admin.audit.read','Xem nhật ký kiểm toán'),
  ('admin.grades.approve','Phê duyệt bảng điểm'),
  ('admin.tasks.manage','Giao và quản lý công việc nội bộ');

INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
  SELECT 'student', id FROM permissions WHERE id LIKE 'student.%';
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
  SELECT 'lecturer', id FROM permissions WHERE id LIKE 'lecturer.%';
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
  SELECT 'staff', id FROM permissions WHERE id IN ('staff.requests.manage','staff.tasks.read_assigned');
INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
  SELECT 'admin', id FROM permissions WHERE id LIKE 'admin.%';
