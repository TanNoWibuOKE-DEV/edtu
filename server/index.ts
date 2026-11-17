import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, inTransaction, migrate } from './db.js';
import { testCloudConnection, syncToCloud, pullFromCloud } from './cloud-sync.js';
import { attachSession, audit, allowedScopes, requireAuth, requireCsrf, requirePermission, sessionToken } from './auth.js';
import { hashPassword, hashToken, id, token, verifyPassword } from './security.js';
import type { PortalRole } from './types.js';

migrate();

const app = express();
const port = Number(process.env.PORT || 3001);
const roles: PortalRole[] = ['student', 'lecturer', 'staff', 'admin'];

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '1mb' }));
app.use(attachSession);

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const isRole = (value: unknown): value is PortalRole => roles.includes(value as PortalRole);
const userSummary = (userId: string) => db.prepare('SELECT id,user_code,full_name,email,status,created_at,last_login_at FROM users WHERE id = ?').get(userId);
const getRoles = (userId: string) => (db.prepare(`SELECT r.name,r.label,ur.is_primary AS isPrimary FROM user_roles ur JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = ? AND ur.revoked_at IS NULL ORDER BY ur.is_primary DESC,ur.granted_at,
  CASE r.name WHEN 'student' THEN 1 WHEN 'lecturer' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END`).all(userId) as Array<{ name: PortalRole; label: string; isPrimary: number }>);
const getPermissions = (role: PortalRole) => (db.prepare(`SELECT p.id FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?`).all(role) as Array<{ id: string }>).map((item) => item.id);

function sessionCookie(response: express.Response, raw: string) {
  response.cookie('edtu_session', raw, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000,
  });
}

function startSession(userId: string, activeRole: PortalRole, response: express.Response) {
  const rawToken = token();
  const csrfToken = token(24);
  db.prepare(`INSERT INTO sessions(id,token_hash,csrf_token,user_id,active_role,expires_at)
    VALUES (?,?,?,?,?,datetime('now','+8 hours'))`).run(id(), hashToken(rawToken), csrfToken, userId, activeRole);
  sessionCookie(response, rawToken);
  return csrfToken;
}

function enforceScope(userId: string, role: string, resource: string, rowId?: string, unitId?: string) {
  const scopes = allowedScopes(userId, role, resource);
  return scopes.some((scope) => scope.scope_type === 'all'
    || (scope.scope_type === 'record' && rowId && scope.scope_id === rowId)
    || (scope.scope_type === 'unit' && unitId && scope.scope_id === unitId)
    || (scope.scope_type === 'department' && unitId && db.prepare('SELECT 1 AS ok FROM departments WHERE unit_id=? AND faculty_unit_id=?').get(scope.scope_id, unitId)));
}

app.get('/api/health', (_request, response) => response.json({ ok: true }));

app.get('/api/cloud/status', async (_request, response) => {
  try {
    const started = Date.now();
    const result = await testCloudConnection();
    const pingMs = Date.now() - started;
    response.json({
      connected: true,
      provider: 'Supabase Cloud (PostgreSQL 17)',
      host: 'db.zpenkfrgrosreaketgzr.supabase.co',
      database: result.info.current_database,
      user: result.info.current_user,
      version: result.info.version,
      region: 'Singapore (ap-southeast-1)',
      pingMs,
    });
  } catch (err: any) {
    response.status(500).json({ connected: false, error: err.message });
  }
});

app.post('/api/cloud/sync', requireAuth, requirePermission('admin.system.manage'), async (request, response) => {
  try {
    const syncResult = await syncToCloud();
    audit('cloud.sync', 'database', 'supabase', syncResult, request);
    response.json(syncResult);
  } catch (err: any) {
    response.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (request, response) => {
  const userCode = clean(request.body?.userCode, 80);
  const password = String(request.body?.password ?? '');
  if (!userCode || !password) {
    return response.status(400).json({ error: 'Vui lòng nhập mã tài khoản và mật khẩu.' });
  }
  const user = db.prepare('SELECT id,password_hash,status,must_change_password FROM users WHERE user_code = ? COLLATE NOCASE OR email = ? COLLATE NOCASE').get(userCode, userCode) as
    { id: string; password_hash: string; status: string; must_change_password: number } | undefined;
  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
    return response.status(401).json({ error: 'Tài khoản hoặc mật khẩu không chính xác.' });
  }
  const assignedRoles = getRoles(user.id);
  if (!assignedRoles.length) return response.status(403).json({ error: 'Tài khoản chưa được cấp vai trò hoạt động.' });
  const activeRole = (assignedRoles.find((assigned) => assigned.isPrimary)?.name || assignedRoles[0].name) as PortalRole;
  const csrfToken = startSession(user.id, activeRole, response);
  db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(user.id);
  const person = userSummary(user.id) as Record<string, unknown>;
  return response.json({ user: person, roles: assignedRoles, activeRole, csrfToken, permissions: getPermissions(activeRole), mustChangePassword: Boolean(user.must_change_password) });
});

app.get('/api/auth/session', requireAuth, (request, response) => {
  const auth = request.auth!;
  response.json({ user: userSummary(auth.userId), roles: getRoles(auth.userId), activeRole: auth.activeRole,
    csrfToken: auth.csrfToken, permissions: [...auth.permissions], mustChangePassword: Boolean(response.locals.mustChangePassword) });
});

app.post('/api/auth/switch-role', requireAuth, requireCsrf, (request, response) => {
  const nextRole = request.body?.role;
  if (!isRole(nextRole)) return response.status(400).json({ error: 'Vai trò không hợp lệ.' });
  const allowed = db.prepare(`SELECT 1 AS ok FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ? AND r.name = ? AND ur.revoked_at IS NULL`).get(request.auth!.userId, nextRole);
  if (!allowed) return response.status(403).json({ error: 'Tài khoản chưa được cấp vai trò này.' });
  const rawSession = sessionToken(request);
  const sessionHash = rawSession ? hashToken(rawSession) : null;
  if (!sessionHash) return response.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
  const nextCsrf = token(24);
  db.prepare('UPDATE sessions SET active_role = ?, csrf_token = ? WHERE token_hash = ?').run(nextRole, nextCsrf, sessionHash);
  audit('role.switch', 'session', String(response.locals.sessionId), { role: nextRole }, request);
  response.json({ activeRole: nextRole, csrfToken: nextCsrf, permissions: getPermissions(nextRole), redirectTo: `/${nextRole}/dashboard` });
});

app.post('/api/auth/change-password', requireAuth, requireCsrf, (request, response) => {
  const currentPassword = String(request.body?.currentPassword ?? '');
  const newPassword = String(request.body?.newPassword ?? '');
  if (newPassword.length < 12 || newPassword.length > 256) return response.status(400).json({ error: 'Mật khẩu mới cần có ít nhất 12 ký tự.' });
  const stored = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(request.auth!.userId) as { password_hash: string };
  if (!verifyPassword(currentPassword, stored.password_hash)) return response.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
  const nextCsrf = token(24);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime(\'now\') WHERE id = ?')
    .run(hashPassword(newPassword), request.auth!.userId);
  db.prepare('UPDATE sessions SET csrf_token = ? WHERE id = ?').run(nextCsrf, String(response.locals.sessionId));
  audit('user.password.change', 'user', request.auth!.userId, null, request);
  response.json({ ok: true, csrfToken: nextCsrf });
});

app.post('/api/auth/logout', requireAuth, requireCsrf, (request, response) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(String(response.locals.sessionId));
  response.clearCookie('edtu_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  response.status(204).end();
});

app.use('/api', requireAuth);

app.get('/api/dashboard', (request, response) => {
  const auth = request.auth!;
  const base = { user: userSummary(auth.userId), role: auth.activeRole, announcements: db.prepare(`
    SELECT id,title,published_at FROM news WHERE published_at IS NOT NULL AND (audience = 'all' OR audience = ?) ORDER BY published_at DESC LIMIT 4
  `).all(auth.activeRole) };
  if (auth.activeRole === 'student') {
    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM enrollments WHERE student_user_id = ? AND status = 'enrolled') AS enrolled,
      (SELECT COUNT(*) FROM grades WHERE student_user_id = ? AND status = 'approved') AS grades,
      (SELECT COUNT(*) FROM tuition_records WHERE student_user_id = ? AND status IN ('unpaid','partial')) AS tuition_due,
      (SELECT COUNT(*) FROM student_support_requests WHERE student_user_id = ? AND status IN ('new','in_progress','waiting')) AS open_requests
    `).get(auth.userId, auth.userId, auth.userId, auth.userId);
    return response.json({ ...base, counts, schedule: db.prepare(`SELECT c.name AS course,cs.code AS section,s.weekday,s.start_time,s.end_time,s.room
      FROM enrollments e JOIN course_sections cs ON cs.id = e.section_id JOIN courses c ON c.id = cs.course_id
      JOIN class_schedules s ON s.section_id = cs.id WHERE e.student_user_id = ? AND e.status = 'enrolled'
      ORDER BY s.weekday,s.start_time LIMIT 5`).all(auth.userId) });
  }
  if (auth.activeRole === 'lecturer') {
    const counts = db.prepare(`SELECT COUNT(DISTINCT lca.section_id) AS classes,
      COUNT(DISTINCT e.student_user_id) AS students,
      (SELECT COUNT(*) FROM assignment_submissions sub JOIN assignments a ON a.id = sub.assignment_id
        JOIN lecturer_course_assignments a2 ON a2.section_id = a.section_id
        WHERE a2.lecturer_user_id = ? AND sub.submitted_at IS NOT NULL AND sub.graded_at IS NULL) AS pending_grading
      FROM lecturer_course_assignments lca LEFT JOIN enrollments e ON e.section_id = lca.section_id AND e.status = 'enrolled'
      WHERE lca.lecturer_user_id = ?`).get(auth.userId, auth.userId);
    return response.json({ ...base, counts, classes: db.prepare(`SELECT cs.id,cs.code,c.name AS course,cs.term,cs.academic_year,cs.room,
      (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = cs.id AND e.status = 'enrolled') AS student_count
      FROM lecturer_course_assignments lca JOIN course_sections cs ON cs.id = lca.section_id JOIN courses c ON c.id = cs.course_id
      WHERE lca.lecturer_user_id = ? ORDER BY cs.academic_year DESC,cs.term LIMIT 6`).all(auth.userId) });
  }
  if (auth.activeRole === 'staff') {
    const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM internal_tasks WHERE assigned_to = ? AND status IN ('new','in_progress','waiting')) AS tasks,
      (SELECT COUNT(*) FROM student_support_requests WHERE assigned_to = ? AND status IN ('new','in_progress','waiting')) AS requests`).get(auth.userId, auth.userId);
    return response.json({ ...base, counts, tasks: db.prepare(`SELECT id,title,status,due_at FROM internal_tasks WHERE assigned_to = ? ORDER BY due_at LIMIT 5`).all(auth.userId) });
  }
  const counts = db.prepare(`SELECT COUNT(*) AS accounts,
    (SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='student' AND ur.revoked_at IS NULL) AS students,
    (SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name='lecturer' AND ur.revoked_at IS NULL) AS lecturers,
    (SELECT COUNT(*) FROM audit_logs WHERE created_at >= datetime('now','-1 day')) AS audit_today FROM users`).get();
  response.json({ ...base, counts, recentAudit: db.prepare(`SELECT al.id,al.action,al.resource_type,al.created_at,u.full_name
    FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id ORDER BY al.created_at DESC LIMIT 6`).all() });
});

app.get('/api/portal/:section', (request, response) => {
  const auth = request.auth!;
  const section = clean(request.params.section, 60);
  const role = auth.activeRole;
  const routeTable: Record<string, { role: PortalRole; permission: string; query: string; params?: Array<string | number | null> }> = {};

  if (role === 'student') {
    routeTable.profile = { role, permission: 'student.profile.read_own', query: `SELECT u.user_code,u.full_name,u.email,u.avatar_url,s.major,s.cohort,s.enrollment_year,
      fac.name AS faculty FROM users u LEFT JOIN students s ON s.user_id=u.id LEFT JOIN university_units fac ON fac.id=s.faculty_unit_id WHERE u.id=?`, params: [auth.userId] };
    routeTable.schedule = { role, permission: 'student.schedule.read_own', query: `SELECT c.code AS course_code,c.name AS course,cs.code AS section,s.weekday,s.start_time,s.end_time,s.room
      FROM enrollments e JOIN course_sections cs ON cs.id=e.section_id JOIN courses c ON c.id=cs.course_id JOIN class_schedules s ON s.section_id=cs.id
      WHERE e.student_user_id=? AND e.status='enrolled' ORDER BY s.weekday,s.start_time`, params: [auth.userId] };
    routeTable.grades = { role, permission: 'student.grades.read_own', query: `SELECT c.code AS course_code,c.name AS course,cs.term,g.score,g.status,comp.name AS component
      FROM grades g JOIN course_sections cs ON cs.id=g.section_id JOIN courses c ON c.id=cs.course_id JOIN grade_components comp ON comp.id=g.component_id
      WHERE g.student_user_id=? AND g.status='approved' ORDER BY cs.academic_year DESC,cs.term`, params: [auth.userId] };
    routeTable.tuition = { role, permission: 'student.tuition.read_own', query: `SELECT tr.term,tr.amount,tr.due_at,tr.status,
      COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.tuition_record_id=tr.id AND pt.status='verified'),0) AS paid
      FROM tuition_records tr WHERE tr.student_user_id=? ORDER BY tr.created_at DESC`, params: [auth.userId] };
    routeTable.news = { role, permission: 'student.profile.read_own', query: `SELECT id,title,body,published_at FROM news WHERE published_at IS NOT NULL AND (audience='all' OR audience='student') ORDER BY published_at DESC` };
    routeTable.courses = { role, permission: 'student.schedule.read_own', query: `SELECT c.code,c.name,c.credits,cs.code AS section,cs.term,cs.academic_year
      FROM enrollments e JOIN course_sections cs ON cs.id=e.section_id JOIN courses c ON c.id=cs.course_id WHERE e.student_user_id=? AND e.status='enrolled'`, params: [auth.userId] };
    routeTable.requests = { role, permission: 'student.requests.create_own', query: `SELECT id,category,subject,status,created_at,updated_at FROM student_support_requests WHERE student_user_id=? ORDER BY created_at DESC`, params: [auth.userId] };
    routeTable.enrollment = { role, permission: 'student.enrollment.create_own', query: `SELECT cs.id,cs.code AS section,c.code AS course_code,c.name AS course,c.credits,cs.term,cs.academic_year,cs.room,cs.capacity,
      (SELECT COUNT(*) FROM enrollments count_e WHERE count_e.section_id=cs.id AND count_e.status='enrolled') AS enrolled_count,
      EXISTS(SELECT 1 FROM enrollments mine WHERE mine.section_id=cs.id AND mine.student_user_id=? AND mine.status='enrolled') AS is_enrolled
      FROM course_sections cs JOIN courses c ON c.id=cs.course_id JOIN enrollment_periods ep ON ep.term=cs.term AND ep.academic_year=cs.academic_year
      WHERE ep.status='open' AND datetime(ep.starts_at)<=datetime('now') AND datetime(ep.ends_at)>=datetime('now') AND cs.status='open'
      ORDER BY c.name,cs.code`, params: [auth.userId] };
    routeTable.assignments = { role, permission: 'student.assignments.read_own', query: `SELECT a.id,a.title,a.description,a.due_at,c.name AS course,cs.code AS section,sub.submitted_at,sub.score,sub.feedback
      FROM enrollments e JOIN assignments a ON a.section_id=e.section_id JOIN course_sections cs ON cs.id=a.section_id JOIN courses c ON c.id=cs.course_id
      LEFT JOIN assignment_submissions sub ON sub.assignment_id=a.id AND sub.student_user_id=e.student_user_id
      WHERE e.student_user_id=? AND e.status='enrolled' ORDER BY a.due_at`, params: [auth.userId] };
    routeTable.syllabus = { role, permission: 'student.syllabus.read_own', query: `SELECT d.id,d.title,d.document_type,d.file_url,c.name AS course,cs.code AS section
      FROM enrollments e JOIN course_documents d ON d.section_id=e.section_id JOIN course_sections cs ON cs.id=e.section_id JOIN courses c ON c.id=cs.course_id
      WHERE e.student_user_id=? AND e.status='enrolled' ORDER BY c.name,d.created_at DESC`, params: [auth.userId] };
    routeTable.transactions = { role, permission: 'student.transactions.read_own', query: `SELECT pt.reference_code,pt.amount,pt.status,pt.paid_at,tr.term
      FROM payment_transactions pt JOIN tuition_records tr ON tr.id=pt.tuition_record_id WHERE tr.student_user_id=? ORDER BY pt.created_at DESC`, params: [auth.userId] };
    routeTable.payments = { role, permission: 'student.payments.create_own', query: `SELECT tr.id,tr.term,tr.amount,tr.due_at,tr.status,
      COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.tuition_record_id=tr.id AND pt.status='verified'),0) AS paid
      FROM tuition_records tr WHERE tr.student_user_id=? ORDER BY tr.created_at DESC`, params: [auth.userId] };
    routeTable.library = { role, permission: 'student.library.read', query: `SELECT id,title,document_type,file_url,created_at FROM course_documents WHERE section_id IN
      (SELECT section_id FROM enrollments WHERE student_user_id=? AND status='enrolled') ORDER BY created_at DESC`, params: [auth.userId] };
    routeTable.curriculum = { role, permission: 'student.curriculum.read_own', query: `SELECT c.code,c.name,c.credits,cs.term,cs.academic_year FROM enrollments e
      JOIN course_sections cs ON cs.id=e.section_id JOIN courses c ON c.id=cs.course_id WHERE e.student_user_id=? ORDER BY cs.academic_year,cs.term`, params: [auth.userId] };
    routeTable.settings = { role, permission: 'student.profile.read_own', query: `SELECT id,user_code,full_name,email,status,created_at,last_login_at FROM users WHERE id=?`, params: [auth.userId] };
  }
  if (role === 'lecturer') {
    routeTable.profile = { role, permission: 'lecturer.profile.read_own', query: `SELECT u.user_code,u.full_name,u.email,u.avatar_url,fac.name AS faculty,dep.name AS department,l.academic_degree,l.title,l.work_phone
      FROM users u LEFT JOIN lecturers l ON l.user_id=u.id LEFT JOIN university_units fac ON fac.id=l.faculty_unit_id LEFT JOIN university_units dep ON dep.id=l.department_unit_id WHERE u.id=?`, params: [auth.userId] };
    routeTable.schedule = { role, permission: 'lecturer.schedule.read_assigned', query: `SELECT c.code AS course_code,c.name AS course,cs.code AS section,s.weekday,s.start_time,s.end_time,s.room
      FROM lecturer_course_assignments lca JOIN course_sections cs ON cs.id=lca.section_id JOIN courses c ON c.id=cs.course_id JOIN class_schedules s ON s.section_id=cs.id
      WHERE lca.lecturer_user_id=? ORDER BY s.weekday,s.start_time`, params: [auth.userId] };
    routeTable.news = { role, permission: 'lecturer.news.read', query: `SELECT id,title,body,published_at FROM news WHERE published_at IS NOT NULL AND (audience='all' OR audience='lecturer') ORDER BY published_at DESC` };
    routeTable.classes = { role, permission: 'lecturer.classes.read_assigned', query: `SELECT cs.id,cs.code,c.code AS course_code,c.name AS course,c.credits,cs.term,cs.academic_year,cs.room,
      (SELECT COUNT(*) FROM enrollments e WHERE e.section_id=cs.id AND e.status='enrolled') AS student_count
      FROM lecturer_course_assignments lca JOIN course_sections cs ON cs.id=lca.section_id JOIN courses c ON c.id=cs.course_id WHERE lca.lecturer_user_id=?`, params: [auth.userId] };
    routeTable.students = { role, permission: 'lecturer.students.read_assigned', query: `SELECT u.user_code,u.full_name,u.email,c.name AS course,cs.code AS section
      FROM lecturer_course_assignments lca JOIN enrollments e ON e.section_id=lca.section_id AND e.status='enrolled'
      JOIN users u ON u.id=e.student_user_id JOIN course_sections cs ON cs.id=lca.section_id JOIN courses c ON c.id=cs.course_id
      WHERE lca.lecturer_user_id=? ORDER BY c.name,u.full_name`, params: [auth.userId] };
    routeTable.grades = { role, permission: 'lecturer.grades.manage_assigned', query: `SELECT g.id,u.user_code,u.full_name,c.name AS course,cs.code AS section,comp.name AS component,g.score,g.status
      FROM lecturer_course_assignments lca JOIN grades g ON g.section_id=lca.section_id JOIN users u ON u.id=g.student_user_id
      JOIN course_sections cs ON cs.id=g.section_id JOIN courses c ON c.id=cs.course_id JOIN grade_components comp ON comp.id=g.component_id
      WHERE lca.lecturer_user_id=? ORDER BY cs.code,u.full_name`, params: [auth.userId] };
    routeTable.assignments = { role, permission: 'lecturer.assignments.manage_assigned', query: `SELECT a.id,a.section_id,a.title,a.description,a.due_at,cs.code AS section,c.name AS course,
      (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id=a.id) AS submissions
      FROM assignments a JOIN lecturer_course_assignments lca ON lca.section_id=a.section_id JOIN course_sections cs ON cs.id=a.section_id
      JOIN courses c ON c.id=cs.course_id WHERE lca.lecturer_user_id=? ORDER BY a.due_at`, params: [auth.userId] };
    routeTable.materials = { role, permission: 'lecturer.classes.read_assigned', query: `SELECT d.id,d.title,d.document_type,d.file_url,d.created_at,c.name AS course,cs.code AS section
      FROM course_documents d JOIN lecturer_course_assignments lca ON lca.section_id=d.section_id JOIN course_sections cs ON cs.id=d.section_id
      JOIN courses c ON c.id=cs.course_id WHERE lca.lecturer_user_id=? ORDER BY d.created_at DESC`, params: [auth.userId] };
    routeTable.attendance = { role, permission: 'lecturer.attendance.manage_assigned', query: `SELECT ats.id,ats.held_at,ats.note,cs.code AS section,c.name AS course,
      (SELECT COUNT(*) FROM attendance a WHERE a.session_id=ats.id) AS marked_count FROM attendance_sessions ats
      JOIN lecturer_course_assignments lca ON lca.section_id=ats.section_id JOIN course_sections cs ON cs.id=ats.section_id JOIN courses c ON c.id=cs.course_id
      WHERE lca.lecturer_user_id=? ORDER BY ats.held_at DESC`, params: [auth.userId] };
    routeTable.settings = { role, permission: 'lecturer.profile.read_own', query: `SELECT id,user_code,full_name,email,status,created_at,last_login_at FROM users WHERE id=?`, params: [auth.userId] };
  }
  if (role === 'staff') {
    routeTable.profile = { role, permission: 'staff.profile.read_own', query: `SELECT u.user_code,u.full_name,u.email,u.avatar_url,unit.name AS unit,dep.name AS department,p.name AS position,s.work_phone
      FROM users u LEFT JOIN staff s ON s.user_id=u.id LEFT JOIN university_units unit ON unit.id=s.unit_id LEFT JOIN university_units dep ON dep.id=s.department_unit_id
      LEFT JOIN positions p ON p.id=s.position_id WHERE u.id=?`, params: [auth.userId] };
    routeTable.news = { role, permission: 'staff.news.manage', query: `SELECT id,title,body,published_at FROM news WHERE published_at IS NOT NULL AND (audience='all' OR audience='staff') ORDER BY published_at DESC` };
    routeTable.tasks = { role, permission: 'staff.tasks.read_assigned', query: `SELECT t.id,t.title,t.description,t.status,t.due_at,u.full_name AS assigned_by
      FROM internal_tasks t JOIN users u ON u.id=t.assigned_by WHERE t.assigned_to=? ORDER BY t.due_at`, params: [auth.userId] };
    routeTable.requests = { role, permission: 'staff.requests.manage', query: `SELECT r.id,r.category,r.subject,r.status,r.created_at,r.updated_at,u.full_name AS student
      FROM student_support_requests r JOIN students s ON s.user_id=r.student_user_id JOIN users u ON u.id=r.student_user_id
      WHERE r.assigned_to=? OR EXISTS (SELECT 1 FROM data_scopes ds WHERE ds.user_id=? AND ds.role_id='staff' AND ds.resource='requests'
        AND (ds.scope_type='all' OR (ds.scope_type='unit' AND ds.scope_id=s.faculty_unit_id)
          OR (ds.scope_type='department' AND ds.scope_id IN (SELECT d.unit_id FROM departments d WHERE d.faculty_unit_id=s.faculty_unit_id))
          OR (ds.scope_type='record' AND ds.scope_id=r.id)))
      ORDER BY r.created_at DESC`, params: [auth.userId, auth.userId] };
    routeTable.students = { role, permission: 'staff.students.read_department', query: `SELECT u.user_code,u.full_name,u.email,s.major,s.cohort,fac.name AS faculty
      FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN university_units fac ON fac.id=s.faculty_unit_id
      WHERE EXISTS (SELECT 1 FROM data_scopes ds WHERE ds.user_id=? AND ds.role_id='staff' AND ds.resource='students'
        AND (ds.scope_type='all' OR (ds.scope_type='unit' AND ds.scope_id=s.faculty_unit_id)
          OR (ds.scope_type='department' AND ds.scope_id IN (SELECT d.unit_id FROM departments d WHERE d.faculty_unit_id=s.faculty_unit_id))
          OR (ds.scope_type='record' AND ds.scope_id=s.user_id)))
      ORDER BY u.full_name`, params: [auth.userId] };
    routeTable.operations = { role, permission: 'staff.academic.manage', query: `SELECT r.id,r.category,r.subject,r.status,r.created_at,u.full_name AS student,u.user_code
      FROM student_support_requests r JOIN users u ON u.id=r.student_user_id ORDER BY r.created_at DESC` };
    routeTable.reports = { role, permission: 'staff.reports.read_department', query: `SELECT uu.name AS faculty,COUNT(DISTINCT s.user_id) AS total_students,
      (SELECT COUNT(*) FROM tuition_records tr JOIN students s2 ON s2.user_id=tr.student_user_id WHERE s2.faculty_unit_id=uu.id AND tr.status='paid') AS paid_tuition,
      (SELECT COUNT(*) FROM tuition_records tr JOIN students s2 ON s2.user_id=tr.student_user_id WHERE s2.faculty_unit_id=uu.id AND tr.status IN ('unpaid','partial')) AS unpaid_tuition
      FROM university_units uu LEFT JOIN students s ON s.faculty_unit_id=uu.id WHERE uu.unit_type='faculty' GROUP BY uu.id` };
    routeTable.settings = { role, permission: 'staff.profile.read_own', query: `SELECT id,user_code,full_name,email,status,created_at,last_login_at FROM users WHERE id=?`, params: [auth.userId] };
  }
  if (role === 'admin') {
    routeTable.news = { role, permission: 'admin.system.manage', query: `SELECT id,title,body,audience,published_at FROM news ORDER BY created_at DESC` };
    routeTable.users = { role, permission: 'admin.users.read', query: `SELECT u.id,u.user_code,u.full_name,u.email,u.status,u.created_at,u.last_login_at,
      group_concat(r.name, ',') AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL LEFT JOIN roles r ON r.id=ur.role_id
      GROUP BY u.id ORDER BY u.created_at DESC` };
    routeTable.units = { role, permission: 'admin.units.manage', query: `SELECT uu.id,uu.code,uu.name,uu.unit_type,uu.parent_id,uu.status,p.name AS parent_name
      FROM university_units uu LEFT JOIN university_units p ON p.id=uu.parent_id ORDER BY uu.unit_type,uu.name` };
    routeTable.audit = { role, permission: 'admin.audit.read', query: `SELECT al.id,al.actor_user_id,u.full_name AS actor,al.active_role,al.action,al.resource_type,al.resource_id,al.details_json,al.ip_address,al.created_at
      FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id ORDER BY al.created_at DESC LIMIT 250` };
    routeTable.courses = { role, permission: 'admin.system.manage', query: `SELECT c.id,c.code,c.name,c.credits,c.status,uu.name AS faculty
      FROM courses c LEFT JOIN university_units uu ON uu.id=c.faculty_unit_id ORDER BY c.code` };
    routeTable.schedule = { role, permission: 'admin.system.manage', query: `SELECT s.id,cs.code AS section,c.name AS course,s.weekday,s.start_time,s.end_time,s.room
      FROM class_schedules s JOIN course_sections cs ON cs.id=s.section_id JOIN courses c ON c.id=cs.course_id ORDER BY s.weekday,s.start_time` };
    routeTable.tuition = { role, permission: 'admin.system.manage', query: `SELECT tr.id,u.user_code,u.full_name,tr.term,tr.amount,tr.status,tr.due_at,
      COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.tuition_record_id=tr.id AND pt.status='verified'),0) AS paid
      FROM tuition_records tr JOIN users u ON u.id=tr.student_user_id ORDER BY tr.created_at DESC` };
    routeTable.settings = { role, permission: 'admin.system.manage', query: `SELECT 'Tên hệ thống' AS setting_name, 'Cổng thông tin Đại học Duy Tân (eDTU Portal)' AS setting_value
      UNION ALL SELECT 'Niên khóa hiện hành', '2026–2027'
      UNION ALL SELECT 'Học kỳ mở', 'Học kỳ 1'
      UNION ALL SELECT 'Đợt đăng ký môn học', 'Đang mở (01/08/2026 – 28/02/2027)'
      UNION ALL SELECT 'Phiên bản phần mềm', 'eDTU v2.0 Enterprise Release'
      UNION ALL SELECT 'Chế độ vận hành', 'Hoạt động bình thường (Online)'` };
  }

  const definition = routeTable[section];
  if (!definition || definition.role !== role) return response.status(404).json({ error: 'Không tìm thấy phân hệ trong vai trò hiện tại.' });
  if (!auth.permissions.has(definition.permission)) return response.status(403).json({ error: 'Bạn chưa được cấp quyền truy cập phân hệ này.' });
  response.json({ items: db.prepare(definition.query).all(...(definition.params || [])) });
});

app.post('/api/requests', requireCsrf, requirePermission('student.requests.create_own'), (request, response) => {
  const category = clean(request.body?.category, 80);
  const subject = clean(request.body?.subject, 200);
  const description = clean(request.body?.description, 4000);
  const hasStudentProfile = db.prepare('SELECT 1 AS ok FROM students WHERE user_id = ?').get(request.auth!.userId);
  if (!hasStudentProfile) return response.status(409).json({ error: 'Hồ sơ sinh viên chưa được cấp.' });
  if (!category || !subject || !description) return response.status(400).json({ error: 'Vui lòng nhập đầy đủ loại yêu cầu, tiêu đề và nội dung.' });
  const requestId = id();
  db.prepare(`INSERT INTO student_support_requests(id,student_user_id,category,subject,description) VALUES (?,?,?,?,?)`)
    .run(requestId, request.auth!.userId, category, subject, description);
  db.prepare(`INSERT INTO support_request_history(id,request_id,actor_user_id,new_status,note) VALUES (?,?,?,'new','Yêu cầu được gửi.')`)
    .run(id(), requestId, request.auth!.userId);
  audit('support_request.create', 'student_support_request', requestId, { category }, request);
  response.status(201).json({ id: requestId });
});

app.post('/api/enrollments', requireCsrf, requirePermission('student.enrollment.create_own'), (request, response) => {
  const sectionId = clean(request.body?.sectionId, 80);
  const studentId = request.auth!.userId;
  if (!db.prepare('SELECT 1 AS ok FROM students WHERE user_id=?').get(studentId)) return response.status(409).json({ error: 'Hồ sơ sinh viên chưa được cấp.' });
  const result = inTransaction(() => {
    const section = db.prepare(`SELECT cs.id,cs.capacity,cs.term,cs.academic_year FROM course_sections cs JOIN enrollment_periods ep ON ep.term=cs.term AND ep.academic_year=cs.academic_year
      WHERE cs.id=? AND cs.status='open' AND ep.status='open' AND datetime(ep.starts_at)<=datetime('now') AND datetime(ep.ends_at)>=datetime('now')`).get(sectionId) as
      { id: string; capacity: number | null; term: string; academic_year: string } | undefined;
    if (!section) return { error: 'Học phần không nằm trong đợt đăng ký đang mở.' };
    if (db.prepare(`SELECT 1 AS ok FROM enrollments WHERE student_user_id=? AND section_id=? AND status='enrolled'`).get(studentId, sectionId)) return { error: 'Bạn đã đăng ký lớp học phần này.' };
    const count = db.prepare(`SELECT COUNT(*) AS count FROM enrollments WHERE section_id=? AND status='enrolled'`).get(sectionId) as { count: number };
    if (section.capacity !== null && Number(count.count) >= section.capacity) return { error: 'Lớp học phần đã đủ số lượng.' };
    const overlap = db.prepare(`SELECT 1 AS conflict FROM class_schedules target JOIN class_schedules existing ON existing.weekday=target.weekday
      JOIN enrollments e ON e.section_id=existing.section_id AND e.student_user_id=? AND e.status='enrolled'
      JOIN course_sections current_section ON current_section.id=existing.section_id
      WHERE target.section_id=? AND current_section.term=? AND current_section.academic_year=?
        AND existing.start_time<target.end_time AND target.start_time<existing.end_time LIMIT 1`).get(studentId, sectionId, section.term, section.academic_year);
    if (overlap) return { error: 'Lịch học bị trùng với học phần bạn đã đăng ký.' };
    const enrollmentId = id();
    db.prepare(`INSERT INTO enrollments(id,student_user_id,section_id) VALUES (?,?,?)`).run(enrollmentId, studentId, sectionId);
    return { enrollmentId };
  });
  if ('error' in result) return response.status(409).json({ error: result.error });
  audit('enrollment.create', 'enrollment', result.enrollmentId, { sectionId }, request);
  response.status(201).json({ id: result.enrollmentId });
});

app.delete('/api/enrollments/:sectionId', requireCsrf, requirePermission('student.enrollment.create_own'), (request, response) => {
  const sectionId = clean(request.params.sectionId, 80);
  const enrollment = db.prepare(`SELECT e.id,cs.term,cs.academic_year FROM enrollments e JOIN course_sections cs ON cs.id=e.section_id
    JOIN enrollment_periods ep ON ep.term=cs.term AND ep.academic_year=cs.academic_year
    WHERE e.student_user_id=? AND e.section_id=? AND e.status='enrolled' AND ep.status='open' AND datetime(ep.starts_at)<=datetime('now') AND datetime(ep.ends_at)>=datetime('now')`)
    .get(request.auth!.userId, sectionId) as { id: string } | undefined;
  if (!enrollment) return response.status(409).json({ error: 'Không thể hủy đăng ký ngoài đợt đăng ký đang mở.' });
  db.prepare(`UPDATE enrollments SET status='dropped' WHERE id=?`).run(enrollment.id);
  audit('enrollment.drop', 'enrollment', enrollment.id, { sectionId }, request);
  response.status(204).end();
});

app.patch('/api/requests/:id/status', requireCsrf, requirePermission('staff.requests.manage'), (request, response) => {
  const requestId = clean(request.params.id, 80);
  const nextStatus = clean(request.body?.status, 30);
  const allowed = ['in_progress', 'waiting', 'completed', 'rejected'];
  if (!allowed.includes(nextStatus)) return response.status(400).json({ error: 'Trạng thái yêu cầu không hợp lệ.' });
  const row = db.prepare(`SELECT r.id,r.status,s.faculty_unit_id FROM student_support_requests r JOIN students s ON s.user_id=r.student_user_id WHERE r.id=?`).get(requestId) as
    { id: string; status: string; faculty_unit_id: string | null } | undefined;
  if (!row) return response.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
  const assigned = db.prepare('SELECT 1 AS ok FROM student_support_requests WHERE id=? AND assigned_to=?').get(requestId, request.auth!.userId);
  if (!assigned && !enforceScope(request.auth!.userId, 'staff', 'requests', requestId, row.faculty_unit_id ?? undefined)) {
    return response.status(403).json({ error: 'Yêu cầu nằm ngoài phạm vi dữ liệu được cấp.' });
  }
  const note = clean(request.body?.note, 1000);
  inTransaction(() => {
    db.prepare(`UPDATE student_support_requests SET status=?,assigned_to=COALESCE(assigned_to,?),updated_at=datetime('now') WHERE id=?`)
      .run(nextStatus, request.auth!.userId, requestId);
    db.prepare(`INSERT INTO support_request_history(id,request_id,actor_user_id,old_status,new_status,note,is_internal) VALUES (?,?,?,?,?,?,?)`)
      .run(id(), requestId, request.auth!.userId, row.status, nextStatus, note || null, request.body?.internal ? 1 : 0);
  });
  audit('support_request.status', 'student_support_request', requestId, { old: row.status, next: nextStatus }, request);
  response.json({ ok: true });
});

app.patch('/api/grades/:id', requireCsrf, requirePermission('lecturer.grades.manage_assigned'), (request, response) => {
  const gradeId = clean(request.params.id, 80);
  const score = Number(request.body?.score);
  if (!Number.isFinite(score) || score < 0 || score > 10) return response.status(400).json({ error: 'Điểm phải nằm trong khoảng 0 đến 10.' });
  const row = db.prepare(`SELECT g.id,g.score,g.status,g.section_id FROM grades g JOIN lecturer_course_assignments lca ON lca.section_id=g.section_id
    WHERE g.id=? AND lca.lecturer_user_id=?`).get(gradeId, request.auth!.userId) as
    { id: string; score: number | null; status: string; section_id: string } | undefined;
  if (!row) return response.status(404).json({ error: 'Không tìm thấy điểm trong lớp được phân công.' });
  if (row.status === 'approved') return response.status(409).json({ error: 'Điểm đã được duyệt. Hãy gửi yêu cầu điều chỉnh để lưu lại lịch sử phê duyệt.' });
  const reason = clean(request.body?.reason, 500);
  inTransaction(() => {
    db.prepare(`UPDATE grades SET score=?,status='draft',updated_by=?,updated_at=datetime('now') WHERE id=?`).run(score, request.auth!.userId, gradeId);
    db.prepare(`INSERT INTO grade_change_logs(id,grade_id,actor_user_id,old_score,new_score,reason) VALUES (?,?,?,?,?,?)`)
      .run(id(), gradeId, request.auth!.userId, row.score, score, reason || null);
  });
  audit('grade.update', 'grade', gradeId, { previous: row.score, next: score }, request);
  response.json({ ok: true, score, status: 'draft' });
});

app.post('/api/grades/:id/adjustments', requireCsrf, requirePermission('lecturer.grades.manage_assigned'), (request, response) => {
  const gradeId = clean(request.params.id, 80);
  const proposedScore = Number(request.body?.score);
  const reason = clean(request.body?.reason, 1000);
  if (!Number.isFinite(proposedScore) || proposedScore < 0 || proposedScore > 10 || reason.length < 8) {
    return response.status(400).json({ error: 'Nhập điểm từ 0 đến 10 và nêu lý do điều chỉnh (tối thiểu 8 ký tự).' });
  }
  const grade = db.prepare(`SELECT g.id,g.score,g.status,g.section_id FROM grades g JOIN lecturer_course_assignments lca ON lca.section_id=g.section_id
    WHERE g.id=? AND lca.lecturer_user_id=?`).get(gradeId, request.auth!.userId) as
    { id: string; score: number | null; status: string; section_id: string } | undefined;
  if (!grade) return response.status(404).json({ error: 'Không tìm thấy điểm trong lớp được phân công.' });
  if (grade.status !== 'approved') return response.status(409).json({ error: 'Chỉ gửi đề nghị điều chỉnh cho điểm đã được duyệt.' });
  if (db.prepare(`SELECT 1 AS ok FROM grade_adjustment_requests WHERE grade_id=? AND status='pending'`).get(gradeId)) {
    return response.status(409).json({ error: 'Điểm này đã có đề nghị điều chỉnh đang chờ xét duyệt.' });
  }
  const adjustmentId = id();
  db.prepare(`INSERT INTO grade_adjustment_requests(id,grade_id,requested_by,old_score,proposed_score,reason) VALUES (?,?,?,?,?,?)`)
    .run(adjustmentId, gradeId, request.auth!.userId, grade.score, proposedScore, reason);
  audit('grade.adjustment.request', 'grade_adjustment_request', adjustmentId, { gradeId, oldScore: grade.score, proposedScore }, request);
  response.status(201).json({ id: adjustmentId, status: 'pending' });
});

app.post('/api/grades/submit/:sectionId', requireCsrf, requirePermission('lecturer.grades.manage_assigned'), (request, response) => {
  const sectionId = clean(request.params.sectionId, 80);
  const assigned = db.prepare('SELECT 1 AS ok FROM lecturer_course_assignments WHERE lecturer_user_id=? AND section_id=?').get(request.auth!.userId, sectionId);
  if (!assigned) return response.status(403).json({ error: 'Lớp học phần nằm ngoài phạm vi được phân công.' });
  const drafts = db.prepare(`SELECT COUNT(*) AS count FROM grades WHERE section_id=? AND status='draft'`).get(sectionId) as { count: number };
  if (!Number(drafts.count)) return response.status(409).json({ error: 'Không có điểm nháp mới để gửi phê duyệt.' });
  const missingScores = db.prepare(`SELECT COUNT(*) AS count FROM grades WHERE section_id=? AND status='draft' AND score IS NULL`).get(sectionId) as { count: number };
  if (Number(missingScores.count)) return response.status(409).json({ error: 'Vui lòng nhập đầy đủ điểm thành phần trước khi gửi phê duyệt.' });
  if (db.prepare(`SELECT 1 AS ok FROM grade_approval_requests WHERE section_id=? AND status='pending'`).get(sectionId)) {
    return response.status(409).json({ error: 'Lớp học phần đã có bảng điểm đang chờ phê duyệt.' });
  }
  const result = inTransaction(() => {
    db.prepare(`UPDATE grades SET status='submitted',updated_by=?,updated_at=datetime('now') WHERE section_id=? AND status='draft'`).run(request.auth!.userId, sectionId);
    const approvalId = id();
    db.prepare(`INSERT INTO grade_approval_requests(id,section_id,requested_by,note) VALUES (?,?,?,?)`)
      .run(approvalId, sectionId, request.auth!.userId, clean(request.body?.note, 500) || null);
    return approvalId;
  });
  audit('grade.submit', 'grade_approval_request', result, { sectionId }, request);
  response.status(201).json({ id: result, status: 'pending' });
});

app.post('/api/grades/approvals/:id', requireCsrf, requirePermission('admin.grades.approve'), (request, response) => {
  const approvalId = clean(request.params.id, 80);
  const decision = request.body?.decision;
  if (decision !== 'approved' && decision !== 'rejected') return response.status(400).json({ error: 'Quyết định phê duyệt không hợp lệ.' });
  const row = db.prepare(`SELECT id,section_id,status FROM grade_approval_requests WHERE id=?`).get(approvalId) as
    { id: string; section_id: string; status: string } | undefined;
  if (row?.status === 'pending') {
    inTransaction(() => {
      db.prepare(`UPDATE grade_approval_requests SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`)
        .run(decision, request.auth!.userId, approvalId);
      db.prepare(`UPDATE grades SET status=?,updated_at=datetime('now') WHERE section_id=? AND status='submitted'`)
        .run(decision, row.section_id);
    });
    audit('grade.approval', 'grade_approval_request', approvalId, { decision }, request);
    return response.json({ ok: true, status: decision });
  }
  const adjustment = db.prepare(`SELECT id,grade_id,requested_by,proposed_score,reason,status FROM grade_adjustment_requests WHERE id=?`)
    .get(approvalId) as { id: string; grade_id: string; requested_by: string; proposed_score: number; reason: string; status: string } | undefined;
  if (!adjustment || adjustment.status !== 'pending') return response.status(404).json({ error: 'Không tìm thấy đề nghị đang chờ duyệt.' });
  inTransaction(() => {
    db.prepare(`UPDATE grade_adjustment_requests SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`)
      .run(decision, request.auth!.userId, approvalId);
    if (decision === 'approved') {
      const current = db.prepare('SELECT score FROM grades WHERE id=?').get(adjustment.grade_id) as { score: number | null } | undefined;
      db.prepare(`UPDATE grades SET score=?,status='approved',updated_by=?,updated_at=datetime('now') WHERE id=?`)
        .run(adjustment.proposed_score, request.auth!.userId, adjustment.grade_id);
      db.prepare(`INSERT INTO grade_change_logs(id,grade_id,actor_user_id,old_score,new_score,reason) VALUES (?,?,?,?,?,?)`)
        .run(id(), adjustment.grade_id, request.auth!.userId, current?.score ?? null, adjustment.proposed_score, `Yêu cầu từ ${adjustment.requested_by}: ${adjustment.reason}`);
    }
  });
  audit('grade.adjustment.review', 'grade_adjustment_request', approvalId, { decision, gradeId: adjustment.grade_id }, request);
  response.json({ ok: true, status: decision });
});

app.get('/api/grade-approvals', requirePermission('admin.grades.approve'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT gar.id,'grade' AS approval_type,gar.status,gar.note,gar.created_at,u.full_name AS requested_by,cs.code AS section,c.name AS course,
      NULL AS old_score,NULL AS proposed_score
    FROM grade_approval_requests gar JOIN users u ON u.id=gar.requested_by JOIN course_sections cs ON cs.id=gar.section_id JOIN courses c ON c.id=cs.course_id
    UNION ALL
    SELECT ar.id,'adjustment' AS approval_type,ar.status,ar.reason AS note,ar.created_at,u.full_name AS requested_by,cs.code AS section,c.name AS course,ar.old_score,ar.proposed_score
    FROM grade_adjustment_requests ar JOIN users u ON u.id=ar.requested_by JOIN grades g ON g.id=ar.grade_id JOIN course_sections cs ON cs.id=g.section_id JOIN courses c ON c.id=cs.course_id
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC`).all() });
});

app.get('/api/users', requirePermission('admin.users.read'), (request, response) => {
  const search = `%${clean(request.query.search, 100)}%`;
  const role = clean(request.query.role, 20);
  const rows = db.prepare(`SELECT u.id,u.user_code,u.full_name,u.email,u.status,u.created_at,u.last_login_at,
    COALESCE(fac.name,staff_unit.name) AS organization,
    group_concat(DISTINCT r.name) AS roles,MAX(CASE WHEN ur.is_primary=1 THEN r.name END) AS primary_role
    FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
    LEFT JOIN roles r ON r.id=ur.role_id LEFT JOIN students s ON s.user_id=u.id LEFT JOIN lecturers l ON l.user_id=u.id LEFT JOIN staff st ON st.user_id=u.id
    LEFT JOIN university_units fac ON fac.id=COALESCE(s.faculty_unit_id,l.faculty_unit_id) LEFT JOIN university_units staff_unit ON staff_unit.id=st.unit_id
    WHERE (u.user_code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)
    GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`).all(search, search, search) as Array<Record<string, unknown>>;
  response.json({ items: rows.filter((row) => !role || String(row.roles || '').split(',').includes(role)) });
});

app.get('/api/users/:id', requirePermission('admin.users.read'), (request, response) => {
  const userId = clean(request.params.id, 80);
  const user = db.prepare(`SELECT u.id,u.user_code,u.full_name,u.email,u.status,u.created_at,u.last_login_at,
    s.faculty_unit_id,s.major,s.cohort,s.enrollment_year,l.department_unit_id,l.academic_degree,l.title AS academic_title,l.work_phone AS lecturer_phone,
    st.unit_id,st.department_unit_id AS staff_department_unit_id,st.position_id,p.name AS position_name,st.work_phone AS staff_phone
    FROM users u LEFT JOIN students s ON s.user_id=u.id LEFT JOIN lecturers l ON l.user_id=u.id LEFT JOIN staff st ON st.user_id=u.id
    LEFT JOIN positions p ON p.id=st.position_id WHERE u.id=?`).get(userId) as Record<string, any> | undefined;
  if (!user) return response.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  response.json({ user, roles: getRoles(userId) });
});

app.patch('/api/users/:id', requireCsrf, requirePermission('admin.users.manage'), (request, response) => {
  const userId = clean(request.params.id, 80);
  const existing = db.prepare(`SELECT u.full_name,u.email,s.faculty_unit_id,s.major,s.cohort,s.enrollment_year,l.department_unit_id,l.academic_degree,l.title,l.work_phone AS lecturer_phone,
    st.unit_id,st.department_unit_id AS staff_department_unit_id,st.position_id,st.work_phone AS staff_phone
    FROM users u LEFT JOIN students s ON s.user_id=u.id LEFT JOIN lecturers l ON l.user_id=u.id LEFT JOIN staff st ON st.user_id=u.id WHERE u.id=?`).get(userId) as Record<string, any> | undefined;
  if (!existing) return response.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  const fullName = clean(request.body?.fullName, 160);
  const email = clean(request.body?.email, 240).toLowerCase();
  if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) return response.status(400).json({ error: 'Nhập họ tên và email hợp lệ.' });
  const rolesForUser = new Set(getRoles(userId).map((role) => role.name));
  const supplied = (key: string) => Object.prototype.hasOwnProperty.call(request.body || {}, key);
  const faculty = supplied('facultyUnitId') ? clean(request.body?.facultyUnitId, 80) || null : existing.faculty_unit_id;
  const department = supplied('departmentUnitId') ? clean(request.body?.departmentUnitId, 80) || null :
    rolesForUser.has('lecturer') ? existing.department_unit_id : existing.staff_department_unit_id;
  if (rolesForUser.has('student') || rolesForUser.has('lecturer')) {
    if (faculty && !db.prepare('SELECT 1 AS ok FROM faculties WHERE unit_id=?').get(faculty)) return response.status(400).json({ error: 'Khoa được chọn không tồn tại.' });
  }
  if (department && !db.prepare('SELECT 1 AS ok FROM departments WHERE unit_id=?').get(department)) return response.status(400).json({ error: 'Bộ môn hoặc phòng ban được chọn không tồn tại.' });
  if (rolesForUser.has('lecturer') && faculty && department && !db.prepare('SELECT 1 AS ok FROM departments WHERE unit_id=? AND faculty_unit_id=?').get(department, faculty)) {
    return response.status(400).json({ error: 'Bộ môn không thuộc khoa đã chọn.' });
  }
  const unitId = supplied('unitId') ? clean(request.body?.unitId, 80) || null : existing.unit_id;
  const unit = unitId ? db.prepare('SELECT 1 AS ok FROM university_units WHERE id=? AND status=\'active\'').get(unitId) : true;
  if (!unit) return response.status(400).json({ error: 'Đơn vị công tác không tồn tại hoặc đã ngừng hoạt động.' });
  let positionId = supplied('positionId') ? clean(request.body?.positionId, 80) || null : existing.position_id;
  let newPosition: { id: string; code: string; name: string } | null = null;
  const positionName = clean(request.body?.positionName, 120);
  if (rolesForUser.has('staff') && supplied('positionName') && positionName) {
    const currentPosition = db.prepare('SELECT id,name FROM positions WHERE id=?').get(positionId) as { id: string; name: string } | undefined;
    if (!currentPosition || currentPosition.name.toLowerCase() !== positionName.toLowerCase()) {
      const existingPosition = db.prepare('SELECT id FROM positions WHERE name=? COLLATE NOCASE').get(positionName) as { id: string } | undefined;
      if (existingPosition) positionId = existingPosition.id;
      else { newPosition = { id: id(), code: `POS-${token(5).toUpperCase()}`, name: positionName }; positionId = newPosition.id; }
    }
  }
  try {
    inTransaction(() => {
      db.prepare(`UPDATE users SET full_name=?,email=?,updated_at=datetime('now') WHERE id=?`).run(fullName, email, userId);
      if (rolesForUser.has('student')) db.prepare(`UPDATE students SET faculty_unit_id=?,major=?,cohort=?,enrollment_year=? WHERE user_id=?`)
        .run(faculty, supplied('major') ? clean(request.body?.major, 160) || null : existing.major,
          supplied('cohort') ? clean(request.body?.cohort, 40) || null : existing.cohort,
          supplied('enrollmentYear') ? Number(request.body?.enrollmentYear) || null : existing.enrollment_year, userId);
      if (rolesForUser.has('lecturer')) db.prepare(`UPDATE lecturers SET faculty_unit_id=?,department_unit_id=?,academic_degree=?,title=?,work_phone=? WHERE user_id=?`)
        .run(faculty, department, supplied('academicDegree') ? clean(request.body?.academicDegree, 80) || null : existing.academic_degree,
          supplied('title') ? clean(request.body?.title, 120) || null : existing.title,
          supplied('workPhone') ? clean(request.body?.workPhone, 40) || null : existing.lecturer_phone, userId);
      if (rolesForUser.has('staff')) {
        if (newPosition) db.prepare(`INSERT INTO positions(id,code,name,unit_id) VALUES (?,?,?,?)`).run(newPosition.id, newPosition.code, newPosition.name, unitId);
        db.prepare(`UPDATE staff SET unit_id=?,department_unit_id=?,position_id=?,work_phone=? WHERE user_id=?`)
          .run(unitId, department, positionId, supplied('workPhone') ? clean(request.body?.workPhone, 40) || null : existing.staff_phone, userId);
      }
    });
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Email hoặc mã vị trí đã được sử dụng.' });
    throw error;
  }
  audit('user.update', 'user', userId, { roles: [...rolesForUser] }, request);
  if (newPosition) audit('position.create', 'position', newPosition.id, { code: newPosition.code }, request);
  response.json({ user: userSummary(userId) });
});

app.post('/api/users', requireCsrf, requirePermission('admin.users.manage'), (request, response) => {
  const userCode = clean(request.body?.userCode, 80);
  const fullName = clean(request.body?.fullName, 160);
  const email = clean(request.body?.email, 240).toLowerCase();
  const role = request.body?.role;
  if (!userCode || !fullName || !/^\S+@\S+\.\S+$/.test(email) || !isRole(role)) {
    return response.status(400).json({ error: 'Vui lòng nhập mã, họ tên, email hợp lệ và một vai trò.' });
  }
  if (role === 'admin' && !request.auth!.permissions.has('admin.roles.manage')) return response.status(403).json({ error: 'Bạn chưa được cấp quyền quản lý vai trò quản trị.' });
  const accountId = id();
  const temporaryPassword = token(15);
  const facultyUnitId = clean(request.body?.facultyUnitId, 80) || null;
  const departmentUnitId = clean(request.body?.departmentUnitId, 80) || null;
  const unitId = clean(request.body?.unitId, 80) || null;
  let positionId = clean(request.body?.positionId, 80) || null;
  const positionName = clean(request.body?.positionName, 120);
  let newPosition: { id: string; code: string; name: string } | null = null;
  if (['student', 'lecturer'].includes(role) && facultyUnitId && !db.prepare('SELECT 1 AS ok FROM faculties WHERE unit_id=?').get(facultyUnitId)) {
    return response.status(400).json({ error: 'Khoa được chọn không tồn tại.' });
  }
  if (departmentUnitId && !db.prepare('SELECT 1 AS ok FROM departments WHERE unit_id=?').get(departmentUnitId)) {
    return response.status(400).json({ error: 'Bộ môn hoặc phòng ban được chọn không tồn tại.' });
  }
  if (role === 'lecturer' && departmentUnitId && facultyUnitId && !db.prepare('SELECT 1 AS ok FROM departments WHERE unit_id=? AND faculty_unit_id=?').get(departmentUnitId, facultyUnitId)) {
    return response.status(400).json({ error: 'Bộ môn không thuộc khoa đã chọn.' });
  }
  if (role === 'staff' && unitId && !db.prepare('SELECT 1 AS ok FROM university_units WHERE id=? AND status=\'active\'').get(unitId)) {
    return response.status(400).json({ error: 'Đơn vị công tác không tồn tại hoặc đã ngừng hoạt động.' });
  }
  if (role === 'staff' && positionId && !db.prepare('SELECT 1 AS ok FROM positions WHERE id=?').get(positionId)) {
    return response.status(400).json({ error: 'Vị trí công việc không tồn tại.' });
  }
  if (role === 'staff' && !positionId && positionName) {
    const existingPosition = db.prepare('SELECT id FROM positions WHERE name=? COLLATE NOCASE').get(positionName) as { id: string } | undefined;
    if (existingPosition) positionId = existingPosition.id;
    else {
      newPosition = { id: id(), code: `POS-${token(5).toUpperCase()}`, name: positionName };
      positionId = newPosition.id;
    }
  }
  try {
    inTransaction(() => {
      db.prepare(`INSERT INTO users(id,user_code,full_name,email,password_hash,status,must_change_password) VALUES (?,?,?,?,?,'pending',1)`)
        .run(accountId, userCode, fullName, email, hashPassword(temporaryPassword));
      db.prepare(`INSERT INTO user_roles(id,user_id,role_id,granted_by,is_primary) VALUES (?,?,?,?,1)`)
        .run(id(), accountId, role, request.auth!.userId);
      if (newPosition) db.prepare(`INSERT INTO positions(id,code,name,unit_id) VALUES (?,?,?,?)`).run(newPosition.id, newPosition.code, newPosition.name, unitId);
      if (role === 'student') db.prepare(`INSERT INTO students(user_id,faculty_unit_id,major,cohort,enrollment_year) VALUES (?,?,?,?,?)`)
        .run(accountId, facultyUnitId, clean(request.body?.major, 160) || null, clean(request.body?.cohort, 40) || null, Number(request.body?.enrollmentYear) || null);
      if (role === 'lecturer') db.prepare(`INSERT INTO lecturers(user_id,faculty_unit_id,department_unit_id,academic_degree,title,work_phone) VALUES (?,?,?,?,?,?)`)
        .run(accountId, facultyUnitId, departmentUnitId, clean(request.body?.academicDegree, 80) || null, clean(request.body?.title, 120) || null, clean(request.body?.workPhone, 40) || null);
      if (role === 'staff') db.prepare(`INSERT INTO staff(user_id,unit_id,department_unit_id,position_id,work_phone) VALUES (?,?,?,?,?)`)
        .run(accountId, unitId, departmentUnitId, positionId, clean(request.body?.workPhone, 40) || null);
    });
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Mã người dùng hoặc email đã tồn tại.' });
    throw error;
  }
  audit('user.create', 'user', accountId, { role }, request);
  if (newPosition) audit('position.create', 'position', newPosition.id, { code: newPosition.code, name: newPosition.name }, request);
  response.status(201).json({ user: userSummary(accountId), role, temporaryPassword, message: 'Tài khoản đang chờ kích hoạt. Hãy gửi mật khẩu tạm qua kênh bảo mật rồi kích hoạt tài khoản.' });
});

app.patch('/api/users/:id/status', requireCsrf, requirePermission('admin.users.manage'), (request, response) => {
  const targetId = clean(request.params.id, 80);
  const status = clean(request.body?.status, 20);
  if (!['active', 'locked', 'pending'].includes(status)) return response.status(400).json({ error: 'Trạng thái tài khoản không hợp lệ.' });
  if (targetId === request.auth!.userId && status !== 'active') return response.status(409).json({ error: 'Không thể khóa tài khoản đang sử dụng.' });
  const found = db.prepare('SELECT id FROM users WHERE id=?').get(targetId);
  if (!found) return response.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  db.prepare(`UPDATE users SET status=?,updated_at=datetime('now') WHERE id=?`).run(status, targetId);
  if (status !== 'active') db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
  audit('user.status', 'user', targetId, { status }, request);
  response.json({ ok: true });
});

app.post('/api/users/:id/reset-password', requireCsrf, requirePermission('admin.users.manage'), (request, response) => {
  const targetId = clean(request.params.id, 80);
  if (!db.prepare('SELECT 1 AS ok FROM users WHERE id=?').get(targetId)) return response.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  const temporaryPassword = token(15);
  inTransaction(() => {
    db.prepare(`UPDATE users SET password_hash=?,must_change_password=1,status='pending',updated_at=datetime('now') WHERE id=?`)
      .run(hashPassword(temporaryPassword), targetId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
  });
  audit('user.password.reset', 'user', targetId, null, request);
  response.json({ temporaryPassword, status: 'pending' });
});

app.post('/api/users/:id/roles', requireCsrf, requirePermission('admin.roles.manage'), (request, response) => {
  const targetId = clean(request.params.id, 80);
  const role = request.body?.role;
  if (!isRole(role)) return response.status(400).json({ error: 'Vai trò không hợp lệ.' });
  const exists = db.prepare('SELECT 1 AS ok FROM users WHERE id=?').get(targetId);
  if (!exists) return response.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  inTransaction(() => {
    const currentPrimary = db.prepare(`SELECT 1 AS ok FROM user_roles WHERE user_id=? AND revoked_at IS NULL AND is_primary=1`).get(targetId);
    const existingPrimary = db.prepare(`SELECT is_primary FROM user_roles WHERE user_id=? AND role_id=? AND revoked_at IS NULL`).get(targetId, role) as { is_primary: number } | undefined;
    const makePrimary = !currentPrimary || Boolean(existingPrimary?.is_primary);
    db.prepare(`INSERT INTO user_roles(id,user_id,role_id,granted_by,revoked_at,is_primary) VALUES (?,?,?,?,NULL,?)
      ON CONFLICT(user_id,role_id) DO UPDATE SET granted_by=excluded.granted_by,granted_at=datetime('now'),revoked_at=NULL,is_primary=excluded.is_primary`)
      .run(id(), targetId, role, request.auth!.userId, Number(makePrimary));
    if (role === 'student') db.prepare('INSERT OR IGNORE INTO students(user_id) VALUES (?)').run(targetId);
    if (role === 'lecturer') db.prepare('INSERT OR IGNORE INTO lecturers(user_id) VALUES (?)').run(targetId);
    if (role === 'staff') db.prepare('INSERT OR IGNORE INTO staff(user_id) VALUES (?)').run(targetId);
  });
  audit('user.role.grant', 'user', targetId, { role }, request);
  response.status(201).json({ roles: getRoles(targetId) });
});

app.put('/api/users/:id/primary-role', requireCsrf, requirePermission('admin.roles.manage'), (request, response) => {
  const targetId = clean(request.params.id, 80);
  const role = request.body?.role;
  if (!isRole(role)) return response.status(400).json({ error: 'Vai trò không hợp lệ.' });
  if (!db.prepare('SELECT 1 AS ok FROM users WHERE id=?').get(targetId)) return response.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  const assignment = db.prepare(`SELECT ur.id FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    WHERE ur.user_id=? AND r.name=? AND ur.revoked_at IS NULL`).get(targetId, role) as { id: string } | undefined;
  if (!assignment) return response.status(409).json({ error: 'Chỉ có thể đặt mặc định cho vai trò đang được cấp.' });
  inTransaction(() => {
    db.prepare('UPDATE user_roles SET is_primary=0 WHERE user_id=? AND revoked_at IS NULL').run(targetId);
    db.prepare('UPDATE user_roles SET is_primary=1 WHERE id=?').run(assignment.id);
  });
  audit('user.role.primary', 'user', targetId, { role }, request);
  response.json({ roles: getRoles(targetId), primaryRole: role });
});

app.delete('/api/users/:id/roles/:role', requireCsrf, requirePermission('admin.roles.manage'), (request, response) => {
  const targetId = clean(request.params.id, 80);
  const role = clean(request.params.role, 20);
  if (!isRole(role)) return response.status(400).json({ error: 'Vai trò không hợp lệ.' });
  const assignment = db.prepare(`SELECT ur.id,ur.is_primary FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.name=? AND ur.revoked_at IS NULL`)
    .get(targetId, role) as { id: string; is_primary: number } | undefined;
  if (!assignment) return response.status(404).json({ error: 'Không tìm thấy vai trò đang hoạt động.' });
  if (role === 'admin') {
    const otherAdmins = db.prepare(`SELECT COUNT(*) AS count FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id
      WHERE r.name='admin' AND ur.revoked_at IS NULL AND u.status='active' AND u.id<>?`).get(targetId) as { count: number };
    if (Number(otherAdmins.count) === 0) return response.status(409).json({ error: 'Không thể thu hồi vai trò admin cuối cùng.' });
  }
  inTransaction(() => {
    db.prepare(`UPDATE user_roles SET revoked_at=datetime('now'),is_primary=0 WHERE id=?`).run(assignment.id);
    if (assignment.is_primary) {
      const next = db.prepare(`SELECT id FROM user_roles WHERE user_id=? AND revoked_at IS NULL ORDER BY granted_at,id LIMIT 1`).get(targetId) as { id: string } | undefined;
      if (next) db.prepare('UPDATE user_roles SET is_primary=1 WHERE id=?').run(next.id);
    }
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
  });
  audit('user.role.revoke', 'user', targetId, { role }, request);
  response.status(204).end();
});

app.post('/api/data-scopes', requireCsrf, requirePermission('admin.roles.manage'), (request, response) => {
  const userId = clean(request.body?.userId, 80);
  const role = request.body?.role;
  const resource = clean(request.body?.resource, 80);
  const scopeType = clean(request.body?.scopeType, 20);
  const scopeId = clean(request.body?.scopeId, 100) || null;
  if (!isRole(role) || !resource || !['own', 'assigned', 'department', 'unit', 'all', 'record'].includes(scopeType)) {
    return response.status(400).json({ error: 'Phạm vi dữ liệu không hợp lệ.' });
  }
  const assignment = db.prepare(`SELECT 1 AS ok FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.name=? AND ur.revoked_at IS NULL`)
    .get(userId, role);
  if (!assignment) return response.status(409).json({ error: 'Người dùng chưa được gán vai trò tương ứng.' });
  const scopeIdRequired = ['unit', 'record', 'department'].includes(scopeType);
  if (scopeIdRequired && !scopeId) return response.status(400).json({ error: 'Phạm vi này cần mã đơn vị hoặc bản ghi.' });
  const scopeIdValue = scopeType === 'all' || scopeType === 'own' || scopeType === 'assigned' ? null : scopeId;
  db.prepare(`INSERT INTO data_scopes(id,user_id,role_id,resource,scope_type,scope_id,granted_by) VALUES (?,?,?,?,?,?,?)`)
    .run(id(), userId, role, resource, scopeType, scopeIdValue, request.auth!.userId);
  audit('data_scope.grant', 'data_scope', null, { userId, role, resource, scopeType, scopeId: scopeIdValue }, request);
  response.status(201).json({ ok: true });
});

app.get('/api/units', requirePermission('admin.units.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT uu.id,uu.code,uu.name,uu.unit_type,uu.parent_id,uu.status,p.name AS parent_name
    FROM university_units uu LEFT JOIN university_units p ON p.id=uu.parent_id ORDER BY uu.unit_type,uu.name`).all() });
});

app.post('/api/units', requireCsrf, requirePermission('admin.units.manage'), (request, response) => {
  const code = clean(request.body?.code, 40);
  const name = clean(request.body?.name, 160);
  const unitType = clean(request.body?.unitType, 30);
  const parentId = clean(request.body?.parentId, 80) || null;
  if (!code || !name || !['faculty', 'department', 'office', 'center', 'other'].includes(unitType)) {
    return response.status(400).json({ error: 'Vui lòng nhập mã, tên và loại đơn vị hợp lệ.' });
  }
  if (unitType === 'department' && (!parentId || !db.prepare(`SELECT 1 AS ok FROM faculties WHERE unit_id=?`).get(parentId))) {
    return response.status(400).json({ error: 'Bộ môn hoặc phòng ban học thuật cần thuộc một khoa đã được khai báo.' });
  }
  const unitId = id();
  try {
    inTransaction(() => {
      db.prepare(`INSERT INTO university_units(id,code,name,unit_type,parent_id) VALUES (?,?,?,?,?)`).run(unitId, code, name, unitType, parentId);
      if (unitType === 'faculty') db.prepare('INSERT INTO faculties(unit_id) VALUES (?)').run(unitId);
      if (unitType === 'department') db.prepare('INSERT INTO departments(unit_id,faculty_unit_id) VALUES (?,?)').run(unitId, parentId);
    });
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Mã đơn vị đã tồn tại.' });
    throw error;
  }
  audit('unit.create', 'university_unit', unitId, { code, unitType }, request);
  response.status(201).json({ id: unitId });
});

app.get('/api/positions', requirePermission('admin.units.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT p.id,p.code,p.name,p.unit_id,u.name AS unit FROM positions p LEFT JOIN university_units u ON u.id=p.unit_id ORDER BY p.name`).all() });
});

app.post('/api/positions', requireCsrf, requirePermission('admin.units.manage'), (request, response) => {
  const code = clean(request.body?.code, 40);
  const name = clean(request.body?.name, 120);
  const unitId = clean(request.body?.unitId, 80) || null;
  if (!code || !name) return response.status(400).json({ error: 'Nhập mã và tên vị trí công việc.' });
  if (unitId && !db.prepare('SELECT 1 AS ok FROM university_units WHERE id=?').get(unitId)) return response.status(400).json({ error: 'Đơn vị của vị trí không tồn tại.' });
  try { db.prepare(`INSERT INTO positions(id,code,name,unit_id) VALUES (?,?,?,?)`).run(id(), code, name, unitId); }
  catch (error) { if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Mã vị trí đã tồn tại.' }); throw error; }
  audit('position.create', 'position', null, { code }, request);
  response.status(201).json({ ok: true });
});

app.get('/api/academic/courses', requirePermission('admin.system.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT c.id,c.code,c.name,c.credits,c.status,uu.name AS faculty
    FROM courses c LEFT JOIN university_units uu ON uu.id=c.faculty_unit_id ORDER BY c.name`).all() });
});

app.post('/api/courses', requireCsrf, requirePermission('admin.system.manage'), (request, response) => {
  const code = clean(request.body?.code, 40);
  const name = clean(request.body?.name, 200);
  const credits = Number(request.body?.credits);
  const facultyId = clean(request.body?.facultyUnitId, 80) || null;
  if (!code || !name || !Number.isInteger(credits) || credits < 0 || credits > 30) return response.status(400).json({ error: 'Nhập mã, tên học phần và số tín chỉ hợp lệ.' });
  if (facultyId && !db.prepare('SELECT 1 AS ok FROM faculties WHERE unit_id=?').get(facultyId)) return response.status(400).json({ error: 'Khoa của học phần không tồn tại.' });
  const courseId = id();
  try { db.prepare(`INSERT INTO courses(id,code,name,credits,faculty_unit_id) VALUES (?,?,?,?,?)`).run(courseId, code, name, credits, facultyId); }
  catch (error) { if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Mã học phần đã tồn tại.' }); throw error; }
  audit('course.create', 'course', courseId, { code }, request);
  response.status(201).json({ id: courseId });
});

app.get('/api/academic/sections', requirePermission('admin.system.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT cs.id,cs.code,cs.term,cs.academic_year,cs.room,cs.capacity,cs.status,c.code AS course_code,c.name AS course,
    (SELECT COUNT(*) FROM enrollments e WHERE e.section_id=cs.id AND e.status='enrolled') AS enrolled_count,
    group_concat(DISTINCT u.full_name) AS lecturers
    FROM course_sections cs JOIN courses c ON c.id=cs.course_id LEFT JOIN lecturer_course_assignments lca ON lca.section_id=cs.id LEFT JOIN users u ON u.id=lca.lecturer_user_id
    GROUP BY cs.id ORDER BY cs.academic_year DESC,cs.term,cs.code`).all() });
});

app.post('/api/course-sections', requireCsrf, requirePermission('admin.system.manage'), (request, response) => {
  const courseId = clean(request.body?.courseId, 80);
  const code = clean(request.body?.code, 60);
  const term = clean(request.body?.term, 40);
  const academicYear = clean(request.body?.academicYear, 20);
  const room = clean(request.body?.room, 80) || null;
  const capacity = request.body?.capacity === '' || request.body?.capacity == null ? null : Number(request.body.capacity);
  if (!courseId || !code || !term || !academicYear || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) return response.status(400).json({ error: 'Nhập đầy đủ mã lớp, học kỳ, năm học và sức chứa hợp lệ.' });
  if (!db.prepare('SELECT 1 AS ok FROM courses WHERE id=?').get(courseId)) return response.status(400).json({ error: 'Học phần được chọn không tồn tại.' });
  const sectionId = id();
  try { db.prepare(`INSERT INTO course_sections(id,course_id,code,term,academic_year,room,capacity) VALUES (?,?,?,?,?,?,?)`)
    .run(sectionId, courseId, code, term, academicYear, room, capacity); }
  catch (error) { if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Mã lớp học phần đã tồn tại.' }); throw error; }
  audit('course_section.create', 'course_section', sectionId, { courseId, code }, request);
  response.status(201).json({ id: sectionId });
});

app.post('/api/lecturer-course-assignments', requireCsrf, requirePermission('admin.system.manage'), (request, response) => {
  const lecturerId = clean(request.body?.lecturerId, 80);
  const sectionId = clean(request.body?.sectionId, 80);
  const lecturer = db.prepare(`SELECT 1 AS ok FROM lecturers l JOIN users u ON u.id=l.user_id JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id WHERE l.user_id=? AND r.name='lecturer' AND ur.revoked_at IS NULL AND u.status='active'`).get(lecturerId);
  const section = db.prepare('SELECT 1 AS ok FROM course_sections WHERE id=?').get(sectionId);
  if (!lecturer || !section) return response.status(400).json({ error: 'Chọn giảng viên đang hoạt động và lớp học phần hợp lệ.' });
  try { db.prepare(`INSERT INTO lecturer_course_assignments(id,lecturer_user_id,section_id,assigned_by) VALUES (?,?,?,?)`).run(id(), lecturerId, sectionId, request.auth!.userId); }
  catch (error) { if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Giảng viên đã được phân công vào lớp này.' }); throw error; }
  audit('lecturer.assignment.create', 'course_section', sectionId, { lecturerId }, request);
  response.status(201).json({ ok: true });
});

app.get('/api/academic/schedules', requirePermission('admin.system.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT s.id,s.weekday,s.start_time,s.end_time,s.room,s.starts_on,s.ends_on,cs.code AS section,c.name AS course
    FROM class_schedules s JOIN course_sections cs ON cs.id=s.section_id JOIN courses c ON c.id=cs.course_id
    ORDER BY s.weekday,s.start_time`).all() });
});

app.post('/api/class-schedules', requireCsrf, requirePermission('admin.system.manage'), (request, response) => {
  const sectionId = clean(request.body?.sectionId, 80);
  const weekday = Number(request.body?.weekday);
  const startTime = clean(request.body?.startTime, 10);
  const endTime = clean(request.body?.endTime, 10);
  const room = clean(request.body?.room, 80) || null;
  const startsOn = clean(request.body?.startsOn, 10) || null;
  const endsOn = clean(request.body?.endsOn, 10) || null;
  if (!sectionId || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) {
    return response.status(400).json({ error: 'Chọn lớp, thứ trong tuần và khung giờ hợp lệ.' });
  }
  if (!db.prepare('SELECT 1 AS ok FROM course_sections WHERE id=?').get(sectionId)) return response.status(404).json({ error: 'Không tìm thấy lớp học phần.' });
  const collision = db.prepare(`SELECT 1 AS conflict FROM class_schedules WHERE section_id=? AND weekday=? AND start_time<? AND ?<end_time`).get(sectionId, weekday, endTime, startTime);
  if (collision) return response.status(409).json({ error: 'Lịch mới trùng với một khung giờ đã khai báo của lớp.' });
  const scheduleId = id();
  db.prepare(`INSERT INTO class_schedules(id,section_id,weekday,start_time,end_time,room,starts_on,ends_on) VALUES (?,?,?,?,?,?,?,?)`)
    .run(scheduleId, sectionId, weekday, startTime, endTime, room, startsOn, endsOn);
  audit('class_schedule.create', 'class_schedule', scheduleId, { sectionId, weekday }, request);
  response.status(201).json({ id: scheduleId });
});

app.get('/api/enrollment-periods', requirePermission('admin.system.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT ep.id,ep.term,ep.academic_year,ep.starts_at,ep.ends_at,ep.status,u.full_name AS created_by
    FROM enrollment_periods ep JOIN users u ON u.id=ep.created_by ORDER BY ep.starts_at DESC`).all() });
});

app.post('/api/enrollment-periods', requireCsrf, requirePermission('admin.system.manage'), (request, response) => {
  const term = clean(request.body?.term, 40);
  const academicYear = clean(request.body?.academicYear, 20);
  const startsAt = clean(request.body?.startsAt, 40);
  const endsAt = clean(request.body?.endsAt, 40);
  const status = request.body?.status === 'open' ? 'open' : 'closed';
  if (!term || !academicYear || !startsAt || !endsAt || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(startsAt) >= Date.parse(endsAt)) {
    return response.status(400).json({ error: 'Nhập học kỳ, năm học và thời gian bắt đầu/kết thúc hợp lệ.' });
  }
  const periodId = id();
  try { db.prepare(`INSERT INTO enrollment_periods(id,term,academic_year,starts_at,ends_at,status,created_by) VALUES (?,?,?,?,?,?,?)`)
    .run(periodId, term, academicYear, startsAt, endsAt, status, request.auth!.userId); }
  catch (error) { if (String(error).includes('UNIQUE constraint failed')) return response.status(409).json({ error: 'Đã có đợt đăng ký cho học kỳ và năm học này.' }); throw error; }
  audit('enrollment_period.create', 'enrollment_period', periodId, { term, academicYear, status }, request);
  response.status(201).json({ id: periodId });
});

app.patch('/api/enrollment-periods/:id/status', requireCsrf, requirePermission('admin.system.manage'), (request, response) => {
  const periodId = clean(request.params.id, 80);
  const status = request.body?.status;
  if (status !== 'open' && status !== 'closed') return response.status(400).json({ error: 'Trạng thái đợt đăng ký không hợp lệ.' });
  const result = db.prepare(`UPDATE enrollment_periods SET status=? WHERE id=?`).run(status, periodId);
  if (!Number(result.changes)) return response.status(404).json({ error: 'Không tìm thấy đợt đăng ký.' });
  audit('enrollment_period.status', 'enrollment_period', periodId, { status }, request);
  response.json({ ok: true });
});

app.get('/api/internal-tasks', (request, response) => {
  const role = request.auth!.activeRole;
  if (role === 'admin' && request.auth!.permissions.has('admin.tasks.manage')) {
    return response.json({ items: db.prepare(`SELECT t.id,t.title,t.description,t.status,t.due_at,u.full_name AS assigned_to FROM internal_tasks t JOIN users u ON u.id=t.assigned_to ORDER BY t.due_at`).all() });
  }
  if (role !== 'staff' || !request.auth!.permissions.has('staff.tasks.read_assigned')) return response.status(403).json({ error: 'Bạn chưa được cấp quyền xem công việc.' });
  const items = db.prepare(`SELECT id,title,description,status,due_at FROM internal_tasks WHERE assigned_to=? ORDER BY due_at`).all(request.auth!.userId);
  response.json({ items });
});

app.post('/api/assignments', requireCsrf, requirePermission('lecturer.assignments.manage_assigned'), (request, response) => {
  const sectionId = clean(request.body?.sectionId, 80);
  const title = clean(request.body?.title, 200);
  const description = clean(request.body?.description, 4000) || null;
  const dueAt = clean(request.body?.dueAt, 40) || null;
  if (!sectionId || !title) return response.status(400).json({ error: 'Chọn lớp học phần và nhập tiêu đề bài tập.' });
  const assigned = db.prepare('SELECT 1 AS ok FROM lecturer_course_assignments WHERE lecturer_user_id=? AND section_id=?').get(request.auth!.userId, sectionId);
  if (!assigned) return response.status(403).json({ error: 'Lớp học phần nằm ngoài phạm vi được phân công.' });
  const assignmentId = id();
  db.prepare(`INSERT INTO assignments(id,section_id,title,description,due_at,created_by) VALUES (?,?,?,?,?,?)`)
    .run(assignmentId, sectionId, title, description, dueAt, request.auth!.userId);
  audit('assignment.create', 'assignment', assignmentId, { sectionId }, request);
  response.status(201).json({ id: assignmentId });
});

app.patch('/api/assignments/:id', requireCsrf, requirePermission('lecturer.assignments.manage_assigned'), (request, response) => {
  const assignmentId = clean(request.params.id, 80);
  const row = db.prepare(`SELECT a.section_id,a.title FROM assignments a JOIN lecturer_course_assignments lca ON lca.section_id=a.section_id
    WHERE a.id=? AND lca.lecturer_user_id=?`).get(assignmentId, request.auth!.userId) as { section_id: string; title: string } | undefined;
  if (!row) return response.status(404).json({ error: 'Không tìm thấy bài tập trong lớp được phân công.' });
  const title = clean(request.body?.title, 200);
  const description = clean(request.body?.description, 4000) || null;
  const dueAt = clean(request.body?.dueAt, 40) || null;
  if (!title) return response.status(400).json({ error: 'Tiêu đề bài tập không được để trống.' });
  db.prepare(`UPDATE assignments SET title=?,description=?,due_at=? WHERE id=?`).run(title, description, dueAt, assignmentId);
  audit('assignment.update', 'assignment', assignmentId, { previousTitle: row.title, title }, request);
  response.json({ ok: true });
});

app.delete('/api/assignments/:id', requireCsrf, requirePermission('lecturer.assignments.manage_assigned'), (request, response) => {
  const assignmentId = clean(request.params.id, 80);
  const row = db.prepare(`SELECT a.section_id FROM assignments a JOIN lecturer_course_assignments lca ON lca.section_id=a.section_id
    WHERE a.id=? AND lca.lecturer_user_id=?`).get(assignmentId, request.auth!.userId) as { section_id: string } | undefined;
  if (!row) return response.status(404).json({ error: 'Không tìm thấy bài tập trong lớp được phân công.' });
  const submissions = db.prepare(`SELECT COUNT(*) AS count FROM assignment_submissions WHERE assignment_id=?`).get(assignmentId) as { count: number };
  if (Number(submissions.count)) return response.status(409).json({ error: 'Bài tập đã có bài nộp. Hãy giữ lại để bảo toàn lịch sử.' });
  db.prepare('DELETE FROM assignments WHERE id=?').run(assignmentId);
  audit('assignment.delete', 'assignment', assignmentId, null, request);
  response.status(204).end();
});

app.post('/api/assignment-submissions', requireCsrf, requirePermission('student.assignments.read_own'), (request, response) => {
  const assignmentId = clean(request.body?.assignmentId, 80);
  const fileUrl = clean(request.body?.fileUrl, 500);
  if (!assignmentId || !fileUrl) return response.status(400).json({ error: 'Vui lòng chọn bài tập và cung cấp link/tệp nộp bài.' });
  const studentId = request.auth!.userId;
  const assignment = db.prepare(`SELECT a.id FROM assignments a JOIN enrollments e ON e.section_id = a.section_id
    WHERE a.id = ? AND e.student_user_id = ? AND e.status = 'enrolled'`).get(assignmentId, studentId);
  if (!assignment) return response.status(403).json({ error: 'Bài tập không thuộc lớp học phần bạn đã đăng ký.' });
  const subId = id();
  db.prepare(`INSERT INTO assignment_submissions(id, assignment_id, student_user_id, file_url, submitted_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(assignment_id, student_user_id) DO UPDATE SET file_url = excluded.file_url, submitted_at = datetime('now')`)
    .run(subId, assignmentId, studentId, fileUrl);
  audit('assignment.submit', 'assignment_submission', subId, { assignmentId }, request);
  response.status(201).json({ ok: true, id: subId });
});

app.patch('/api/assignment-submissions/:id/grade', requireCsrf, requirePermission('lecturer.assignments.manage_assigned'), (request, response) => {
  const subId = clean(request.params.id, 80);
  const score = Number(request.body?.score);
  const feedback = clean(request.body?.feedback, 2000) || null;
  if (!Number.isFinite(score) || score < 0 || score > 10) return response.status(400).json({ error: 'Điểm chấm phải nằm trong khoảng 0 đến 10.' });
  const row = db.prepare(`SELECT sub.id FROM assignment_submissions sub
    JOIN assignments a ON a.id = sub.assignment_id
    JOIN lecturer_course_assignments lca ON lca.section_id = a.section_id
    WHERE sub.id = ? AND lca.lecturer_user_id = ?`).get(subId, request.auth!.userId);
  if (!row) return response.status(404).json({ error: 'Không tìm thấy bài nộp trong lớp được phân công.' });
  db.prepare(`UPDATE assignment_submissions SET score = ?, feedback = ?, graded_by = ?, graded_at = datetime('now') WHERE id = ?`)
    .run(score, feedback, request.auth!.userId, subId);
  audit('assignment.grade', 'assignment_submission', subId, { score }, request);
  response.json({ ok: true, score, feedback });
});

app.post('/api/course-documents', requireCsrf, requirePermission('lecturer.classes.read_assigned'), (request, response) => {
  const sectionId = clean(request.body?.sectionId, 80);
  const title = clean(request.body?.title, 200);
  const documentType = clean(request.body?.documentType, 40) || 'slides';
  const fileUrl = clean(request.body?.fileUrl, 500);
  if (!sectionId || !title || !fileUrl) return response.status(400).json({ error: 'Vui lòng chọn lớp học phần, nhập tiêu đề và link tài liệu.' });
  const assigned = db.prepare(`SELECT 1 AS ok FROM lecturer_course_assignments WHERE section_id = ? AND lecturer_user_id = ?`).get(sectionId, request.auth!.userId);
  if (!assigned) return response.status(403).json({ error: 'Lớp học phần không nằm trong phân công của bạn.' });
  const docId = id();
  db.prepare(`INSERT INTO course_documents(id, section_id, title, document_type, file_url, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)`).run(docId, sectionId, title, documentType, fileUrl, request.auth!.userId);
  audit('course_document.create', 'course_document', docId, { sectionId, title }, request);
  response.status(201).json({ id: docId });
});

app.post('/api/payments', requireCsrf, requirePermission('student.payments.create_own'), (request, response) => {
  const tuitionRecordId = clean(request.body?.tuitionRecordId, 80);
  const amount = Number(request.body?.amount);
  if (!tuitionRecordId || !amount || amount <= 0) return response.status(400).json({ error: 'Khoản học phí hoặc số tiền thanh toán không hợp lệ.' });
  const record = db.prepare(`SELECT id, amount, status FROM tuition_records WHERE id = ? AND student_user_id = ?`).get(tuitionRecordId, request.auth!.userId) as { id: string; amount: number; status: string } | undefined;
  if (!record) return response.status(404).json({ error: 'Không tìm thấy thông tin học phí của bạn.' });
  const refCode = `DTU-PAY-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const txnId = id();
  inTransaction(() => {
    db.prepare(`INSERT INTO payment_transactions(id, tuition_record_id, amount, reference_code, status, paid_at)
      VALUES (?, ?, ?, ?, 'verified', datetime('now'))`).run(txnId, tuitionRecordId, amount, refCode);
    db.prepare(`UPDATE tuition_records SET status = 'paid' WHERE id = ?`).run(tuitionRecordId);
  });
  audit('tuition.pay', 'payment_transaction', txnId, { refCode, amount }, request);
  response.status(201).json({ id: txnId, referenceCode: refCode, status: 'verified', amount });
});

app.post('/api/news', requireCsrf, (request, response) => {
  const role = request.auth!.activeRole;
  const allowed = (role === 'admin' && request.auth!.permissions.has('admin.system.manage')) ||
                  (role === 'staff' && request.auth!.permissions.has('staff.news.manage'));
  if (!allowed) return response.status(403).json({ error: 'Bạn chưa được cấp quyền đăng thông báo.' });
  const title = clean(request.body?.title, 200);
  const body = clean(request.body?.body, 10000);
  const audience = clean(request.body?.audience, 30) || 'all';
  if (!title || !body) return response.status(400).json({ error: 'Vui lòng nhập tiêu đề và nội dung thông báo.' });
  const newsId = id();
  db.prepare(`INSERT INTO news(id, title, body, audience, published_by, published_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(newsId, title, body, audience, request.auth!.userId);
  audit('news.create', 'news', newsId, { title, audience }, request);
  response.status(201).json({ id: newsId });
});

app.delete('/api/news/:id', requireCsrf, (request, response) => {
  const role = request.auth!.activeRole;
  const allowed = (role === 'admin' && request.auth!.permissions.has('admin.system.manage')) ||
                  (role === 'staff' && request.auth!.permissions.has('staff.news.manage'));
  if (!allowed) return response.status(403).json({ error: 'Bạn chưa được cấp quyền xóa thông báo.' });
  const newsId = clean(request.params.id, 80);
  db.prepare('DELETE FROM news WHERE id = ?').run(newsId);
  audit('news.delete', 'news', newsId, null, request);
  response.status(204).end();
});

app.post('/api/attendance/sessions', requireCsrf, requirePermission('lecturer.attendance.manage_assigned'), (request, response) => {
  const sectionId = clean(request.body?.sectionId, 80);
  const heldAt = clean(request.body?.heldAt, 40);
  const note = clean(request.body?.note, 500) || null;
  if (!sectionId || !heldAt || Number.isNaN(Date.parse(heldAt))) return response.status(400).json({ error: 'Chọn lớp học phần và thời gian điểm danh hợp lệ.' });
  const assigned = db.prepare('SELECT 1 AS ok FROM lecturer_course_assignments WHERE lecturer_user_id=? AND section_id=?').get(request.auth!.userId, sectionId);
  if (!assigned) return response.status(403).json({ error: 'Lớp học phần nằm ngoài phạm vi được phân công.' });
  const sessionId = id();
  db.prepare(`INSERT INTO attendance_sessions(id,section_id,held_at,created_by,note) VALUES (?,?,?,?,?)`)
    .run(sessionId, sectionId, heldAt, request.auth!.userId, note);
  audit('attendance.session.create', 'attendance_session', sessionId, { sectionId }, request);
  response.status(201).json({ id: sessionId });
});

app.get('/api/attendance/sessions/:id/students', requirePermission('lecturer.attendance.manage_assigned'), (request, response) => {
  const sessionId = clean(request.params.id, 80);
  const session = db.prepare(`SELECT ats.section_id FROM attendance_sessions ats JOIN lecturer_course_assignments lca ON lca.section_id=ats.section_id
    WHERE ats.id=? AND lca.lecturer_user_id=?`).get(sessionId, request.auth!.userId) as { section_id: string } | undefined;
  if (!session) return response.status(404).json({ error: 'Không tìm thấy buổi học trong lớp được phân công.' });
  response.json({ items: db.prepare(`SELECT u.id AS student_user_id,u.user_code,u.full_name,a.status,a.note
    FROM enrollments e JOIN users u ON u.id=e.student_user_id LEFT JOIN attendance a ON a.session_id=? AND a.student_user_id=u.id
    WHERE e.section_id=? AND e.status='enrolled' ORDER BY u.full_name`).all(sessionId, session.section_id) });
});

app.put('/api/attendance/sessions/:id/records', requireCsrf, requirePermission('lecturer.attendance.manage_assigned'), (request, response) => {
  const sessionId = clean(request.params.id, 80);
  const session = db.prepare(`SELECT ats.section_id FROM attendance_sessions ats JOIN lecturer_course_assignments lca ON lca.section_id=ats.section_id
    WHERE ats.id=? AND lca.lecturer_user_id=?`).get(sessionId, request.auth!.userId) as { section_id: string } | undefined;
  if (!session) return response.status(404).json({ error: 'Không tìm thấy buổi học trong lớp được phân công.' });
  const records = Array.isArray(request.body?.records) ? request.body.records.slice(0, 500) : [];
  if (!records.length) return response.status(400).json({ error: 'Chọn trạng thái cho ít nhất một sinh viên.' });
  const validStatuses = ['present', 'absent', 'late', 'excused'];
  const enrolled = new Set((db.prepare(`SELECT student_user_id FROM enrollments WHERE section_id=? AND status='enrolled'`).all(session.section_id) as Array<{ student_user_id: string }>).map((row) => row.student_user_id));
  if (records.some((record: any) => !enrolled.has(clean(record.studentUserId, 80)) || !validStatuses.includes(record.status))) {
    return response.status(400).json({ error: 'Danh sách có sinh viên ngoài lớp hoặc trạng thái không hợp lệ.' });
  }
  inTransaction(() => {
    const save = db.prepare(`INSERT INTO attendance(id,session_id,student_user_id,status,note,marked_by) VALUES (?,?,?,?,?,?)
      ON CONFLICT(session_id,student_user_id) DO UPDATE SET status=excluded.status,note=excluded.note,marked_by=excluded.marked_by,created_at=datetime('now')`);
    records.forEach((record: any) => save.run(id(), sessionId, clean(record.studentUserId, 80), record.status, clean(record.note, 500) || null, request.auth!.userId));
  });
  audit('attendance.records.save', 'attendance_session', sessionId, { count: records.length }, request);
  response.json({ ok: true, saved: records.length });
});

app.post('/api/internal-tasks', requireCsrf, requirePermission('admin.tasks.manage'), (request, response) => {
  const title = clean(request.body?.title, 200);
  const assignedTo = clean(request.body?.assignedTo, 80);
  const dueAt = clean(request.body?.dueAt, 40) || null;
  const description = clean(request.body?.description, 2000) || null;
  if (!title || !assignedTo || !db.prepare(`SELECT 1 AS ok FROM users u JOIN staff s ON s.user_id=u.id JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE u.id=? AND u.status='active' AND r.name='staff' AND ur.revoked_at IS NULL`).get(assignedTo)) {
    return response.status(400).json({ error: 'Vui lòng chọn nhân viên đang hoạt động và nhập tiêu đề công việc.' });
  }
  const taskId = id();
  db.prepare(`INSERT INTO internal_tasks(id,title,description,assigned_to,assigned_by,due_at) VALUES (?,?,?,?,?,?)`)
    .run(taskId, title, description, assignedTo, request.auth!.userId, dueAt);
  audit('task.create', 'internal_task', taskId, { assignedTo }, request);
  response.status(201).json({ id: taskId });
});

app.patch('/api/internal-tasks/:id', requireCsrf, (request, response) => {
  const taskId = clean(request.params.id, 80);
  const status = clean(request.body?.status, 30);
  if (!['in_progress', 'waiting', 'completed'].includes(status)) return response.status(400).json({ error: 'Trạng thái công việc không hợp lệ.' });
  const row = db.prepare('SELECT assigned_to,status FROM internal_tasks WHERE id=?').get(taskId) as { assigned_to: string; status: string } | undefined;
  if (!row) return response.status(404).json({ error: 'Không tìm thấy công việc.' });
  const isAdmin = request.auth!.activeRole === 'admin' && request.auth!.permissions.has('admin.tasks.manage');
  const isAssignee = request.auth!.activeRole === 'staff' && request.auth!.userId === row.assigned_to && request.auth!.permissions.has('staff.tasks.read_assigned');
  if (!isAdmin && !isAssignee) return response.status(403).json({ error: 'Công việc nằm ngoài phạm vi được cấp.' });
  db.prepare(`UPDATE internal_tasks SET status=?,updated_at=datetime('now') WHERE id=?`).run(status, taskId);
  audit('task.status', 'internal_task', taskId, { old: row.status, next: status }, request);
  response.json({ ok: true });
});

app.get('/api/roles/permissions', requirePermission('admin.roles.manage'), (_request, response) => {
  response.json({ items: db.prepare(`SELECT r.name AS role,p.id AS permission,p.description,
    CASE WHEN rp.permission_id IS NULL THEN 0 ELSE 1 END AS granted
    FROM roles r CROSS JOIN permissions p LEFT JOIN role_permissions rp ON rp.role_id=r.id AND rp.permission_id=p.id
    ORDER BY r.name,p.id`).all() });
});

app.put('/api/roles/:role/permissions', requireCsrf, requirePermission('admin.roles.manage'), (request, response) => {
  const role = clean(request.params.role, 20);
  const permissionIds = Array.isArray(request.body?.permissionIds) ? request.body.permissionIds.filter((value: unknown) => typeof value === 'string') as string[] : null;
  if (!isRole(role) || !permissionIds) return response.status(400).json({ error: 'Danh sách vai trò hoặc quyền không hợp lệ.' });
  const known = db.prepare(`SELECT id FROM permissions`).all() as Array<{ id: string }>;
  const valid = new Set(known.map((permission) => permission.id));
  if (permissionIds.some((permission) => !valid.has(permission))) return response.status(400).json({ error: 'Danh sách có quyền không tồn tại.' });
  if (role === 'admin') {
    const required = ['admin.users.read', 'admin.users.manage', 'admin.roles.manage', 'admin.units.manage', 'admin.audit.read', 'admin.system.manage'];
    if (required.some((permission) => !permissionIds.includes(permission))) return response.status(409).json({ error: 'Vai trò admin cần giữ các quyền quản trị lõi.' });
  }
  inTransaction(() => {
    db.prepare(`DELETE FROM role_permissions WHERE role_id=?`).run(role);
    const insert = db.prepare(`INSERT INTO role_permissions(role_id,permission_id) VALUES (?,?)`);
    permissionIds.forEach((permission) => insert.run(role, permission));
  });
  audit('role.permissions.update', 'role', role, { count: permissionIds.length }, request);
  response.json({ ok: true });
});

app.get('/api/data-scopes/:userId', requirePermission('admin.roles.manage'), (request, response) => {
  const userId = clean(request.params.userId, 80);
  response.json({ items: db.prepare(`SELECT ds.id,ds.resource,ds.role_id AS role,ds.scope_type,ds.scope_id,ds.created_at,
    u.full_name AS granted_by FROM data_scopes ds LEFT JOIN users u ON u.id=ds.granted_by WHERE ds.user_id=? ORDER BY ds.created_at DESC`).all(userId) });
});

app.delete('/api/data-scopes/:id', requireCsrf, requirePermission('admin.roles.manage'), (request, response) => {
  const scopeId = clean(request.params.id, 80);
  const exists = db.prepare('SELECT id FROM data_scopes WHERE id=?').get(scopeId);
  if (!exists) return response.status(404).json({ error: 'Không tìm thấy phạm vi dữ liệu.' });
  db.prepare('DELETE FROM data_scopes WHERE id=?').run(scopeId);
  audit('data_scope.revoke', 'data_scope', scopeId, null, request);
  response.status(204).end();
});

const candidateDist1 = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const candidateDist2 = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const publicDir = existsSync(candidateDist1) ? candidateDist1 : candidateDist2;
app.use(express.static(publicDir));
app.get(/^(?!\/api(?:\/|$)).*/, (_request, response, next) => {
  response.sendFile(resolve(publicDir, 'index.html'), (error) => { if (error) next(error); });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'Hệ thống chưa thể xử lý yêu cầu này.' });
});

const server = createServer(app);
server.listen(port, '0.0.0.0', () => console.log(`eDTU API listening on http://0.0.0.0:${port}`));

process.on('SIGINT', () => { server.close(); db.close(); });
process.on('SIGTERM', () => { server.close(); db.close(); });
