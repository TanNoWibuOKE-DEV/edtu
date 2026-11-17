import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, ArrowRight, ArrowUpRight, Award, BadgeCheck, Bell,
  BookMarked, BookOpen, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleAlert, ClipboardCheck, ClipboardList, Clock, CreditCard, Database, Download,
  Eye, EyeOff, FileClock, FileText, FolderOpen, GraduationCap, LayoutDashboard, LifeBuoy,
  LockKeyhole, LogOut, Menu, Newspaper, Plus, QrCode, RefreshCw, Search, Send, Settings,
  ShieldCheck, SlidersHorizontal, Sparkles, TableProperties, Trash2, UserRound, Users, WalletCards, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, formatDate, formatDateTime, formatMoney, type PortalRole, type RoleAssignment, type Session } from './api';

type AuthState = {
  session: Session | null;
  loading: boolean;
  error: string;
  setSession: (session: Session | null) => void;
  refresh: () => Promise<void>;
};

const roleInfo: Record<PortalRole, { label: string; short: string; unit: string; color: string; bg: string }> = {
  student: { label: 'Sinh viên', short: 'SV', unit: 'Cổng Sinh viên DTU', color: '#b91c1c', bg: '#fef2f2' },
  lecturer: { label: 'Giảng viên', short: 'GV', unit: 'Cổng Giảng dạy & Nghiên cứu', color: '#1d4ed8', bg: '#eff6ff' },
  staff: { label: 'Nhân viên', short: 'NV', unit: 'Cổng Nghiệp vụ & Vận hành', color: '#b45309', bg: '#fffbeb' },
  admin: { label: 'Quản trị viên', short: 'AD', unit: 'Trung tâm Quản trị Đại học', color: '#6d28d9', bg: '#f5f3ff' },
};

type NavItem = { key: string; label: string; icon: LucideIcon; group: string; badge?: string };
const navigation: Record<PortalRole, NavItem[]> = {
  student: [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard, group: 'Không gian của tôi' },
    { key: 'profile', label: 'Hồ sơ & Thẻ SV', icon: UserRound, group: 'Không gian của tôi' },
    { key: 'news', label: 'Tin tức & Thông báo', icon: Newspaper, group: 'Không gian của tôi' },
    { key: 'schedule', label: 'Thời khóa biểu', icon: CalendarDays, group: 'Học tập & Rèn luyện', badge: 'Tuần này' },
    { key: 'enrollment', label: 'Đăng ký môn học', icon: BookOpen, group: 'Học tập & Rèn luyện', badge: 'Đang mở' },
    { key: 'grades', label: 'Bảng điểm & GPA', icon: TableProperties, group: 'Học tập & Rèn luyện' },
    { key: 'curriculum', label: 'Chương trình đào tạo', icon: GraduationCap, group: 'Học tập & Rèn luyện' },
    { key: 'assignments', label: 'Bài tập & Đồ án', icon: ClipboardCheck, group: 'Học tập & Rèn luyện' },
    { key: 'syllabus', label: 'Đề cương học phần', icon: FileText, group: 'Học tập & Rèn luyện' },
    { key: 'tuition', label: 'Tra cứu học phí', icon: WalletCards, group: 'Tài chính & Dịch vụ' },
    { key: 'payments', label: 'Thanh toán VietQR', icon: CreditCard, group: 'Tài chính & Dịch vụ', badge: 'Mới' },
    { key: 'transactions', label: 'Lịch sử giao dịch', icon: FileClock, group: 'Tài chính & Dịch vụ' },
    { key: 'library', label: 'Thư viện số DTU', icon: BookMarked, group: 'Tài chính & Dịch vụ' },
    { key: 'services', label: 'Hỗ trợ sinh viên', icon: LifeBuoy, group: 'Tài chính & Dịch vụ' },
    { key: 'settings', label: 'Cài đặt tài khoản', icon: Settings, group: 'Hệ thống' },
  ],
  lecturer: [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard, group: 'Giảng dạy' },
    { key: 'profile', label: 'Hồ sơ giảng viên', icon: UserRound, group: 'Giảng dạy' },
    { key: 'schedule', label: 'Lịch giảng dạy', icon: CalendarDays, group: 'Giảng dạy' },
    { key: 'classes', label: 'Lớp học phần', icon: BookOpen, group: 'Quản lý lớp học' },
    { key: 'students', label: 'Danh sách sinh viên', icon: Users, group: 'Quản lý lớp học' },
    { key: 'grades', label: 'Quản lý điểm số', icon: TableProperties, group: 'Quản lý lớp học', badge: 'Chấm điểm' },
    { key: 'assignments', label: 'Bài tập & Đồ án', icon: ClipboardCheck, group: 'Quản lý lớp học' },
    { key: 'attendance', label: 'Điểm danh lớp', icon: ClipboardList, group: 'Quản lý lớp học' },
    { key: 'materials', label: 'Tài liệu giảng dạy', icon: FolderOpen, group: 'Học liệu' },
    { key: 'news', label: 'Thông báo nội bộ', icon: Newspaper, group: 'Thông tin' },
    { key: 'settings', label: 'Cài đặt', icon: Settings, group: 'Hệ thống' },
  ],
  staff: [
    { key: 'dashboard', label: 'Tổng quan công việc', icon: LayoutDashboard, group: 'Vận hành' },
    { key: 'profile', label: 'Hồ sơ nhân viên', icon: UserRound, group: 'Vận hành' },
    { key: 'tasks', label: 'Công việc được giao', icon: ClipboardCheck, group: 'Vận hành', badge: 'Nhiệm vụ' },
    { key: 'requests', label: 'Tiếp nhận yêu cầu', icon: LifeBuoy, group: 'Nghiệp vụ một cửa', badge: 'Hỗ trợ' },
    { key: 'operations', label: 'Quản lý nghiệp vụ', icon: BriefcaseBusiness, group: 'Nghiệp vụ một cửa' },
    { key: 'students', label: 'Tra cứu sinh viên', icon: Search, group: 'Dữ liệu' },
    { key: 'reports', label: 'Báo cáo thống kê', icon: Activity, group: 'Dữ liệu' },
    { key: 'news', label: 'Quản lý thông báo', icon: Newspaper, group: 'Thông tin' },
    { key: 'settings', label: 'Cài đặt', icon: Settings, group: 'Hệ thống' },
  ],
  admin: [
    { key: 'dashboard', label: 'Tổng quan hệ thống', icon: LayoutDashboard, group: 'Quản trị' },
    { key: 'users', label: 'Quản lý tài khoản', icon: Users, group: 'Tổ chức & Nhân sự' },
    { key: 'students', label: 'Hồ sơ sinh viên', icon: GraduationCap, group: 'Tổ chức & Nhân sự' },
    { key: 'lecturers', label: 'Đội ngũ giảng viên', icon: UserRound, group: 'Tổ chức & Nhân sự' },
    { key: 'staff', label: 'Cán bộ nhân viên', icon: BriefcaseBusiness, group: 'Tổ chức & Nhân sự' },
    { key: 'units', label: 'Khoa & phòng ban', icon: Building2, group: 'Tổ chức & Nhân sự' },
    { key: 'education', label: 'Kế hoạch đào tạo', icon: BookOpen, group: 'Đào tạo & Học vụ' },
    { key: 'courses', label: 'Danh mục học phần', icon: BookMarked, group: 'Đào tạo & Học vụ' },
    { key: 'schedule', label: 'Lớp & Thời khóa biểu', icon: CalendarDays, group: 'Đào tạo & Học vụ' },
    { key: 'finance', label: 'Quản lý tài chính', icon: WalletCards, group: 'Tài chính' },
    { key: 'news', label: 'Quản lý tin tức', icon: Newspaper, group: 'Truyền thông' },
    { key: 'permissions', label: 'Phân quyền vai trò', icon: ShieldCheck, group: 'Hệ thống' },
    { key: 'audit', label: 'Nhật ký kiểm toán', icon: FileClock, group: 'Hệ thống' },
    { key: 'settings', label: 'Cấu hình hệ thống', icon: SlidersHorizontal, group: 'Hệ thống' },
  ],
};

const roleOptions: Array<{ id: PortalRole; label: string; detail: string }> = [
  { id: 'student', label: 'Sinh viên', detail: 'Mã sinh viên' },
  { id: 'lecturer', label: 'Giảng viên', detail: 'Mã giảng viên' },
  { id: 'staff', label: 'Nhân viên', detail: 'Mã nhân viên' },
  { id: 'admin', label: 'Quản trị viên', detail: 'Tài khoản quản trị' },
];

function useAuthState(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const next = await api<Session>('/api/auth/session');
      setSession(next);
      setError('');
    } catch (reason) {
      if ((reason as Error & { status?: number }).status !== 401) setError((reason as Error).message);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);
  return { session, loading, error, setSession, refresh };
}

function App() {
  const auth = useAuthState();
  return <Routes>
    <Route path="/login" element={<LoginPage auth={auth} />} />
    <Route path="/:role/:section?" element={<Workspace auth={auth} />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}

// -------------------------------------------------------------
// LOGIN PAGE
// -------------------------------------------------------------
function LoginPage({ auth }: { auth: AuthState }) {
  const navigate = useNavigate();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (auth.session) navigate(`/${auth.session.activeRole}/dashboard`, { replace: true });
  }, [auth.session, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await api<Session>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userCode, password }),
      });
      auth.setSession(data);
      navigate(`/${data.activeRole}/dashboard`, { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-page">
    <section className="login-story">
      <div className="story-noise" />
      <div className="login-story-header">
        <Link to="/login" className="login-dtu-brand-box">
          <img src="/logo-dtu.png" alt="Đại học Duy Tân - Duy Tan University" className="login-dtu-logo" />
        </Link>
        <span className="accreditation-pill">ABET ACCREDITED · TOP 500 THE</span>
      </div>

      <div className="story-content">
        <div className="eyebrow light">
          <span className="live-dot" /> TRƯỜNG ĐẠI HỌC DUY TÂN · TIÊN PHONG ĐỔI MỚI
        </div>
        <h1>
          Hệ sinh thái học vụ số.<br />
          <em>Khơi nguồn sáng tạo & tri thức.</em>
        </h1>
        <p>
          Cổng thông tin đào tạo & quản trị eDTU – Đồng hành cùng hơn 30.000 sinh viên và cán bộ giảng viên trong hành trình học tập, nghiên cứu và phát triển chuẩn quốc tế ABET.
        </p>

        <div className="story-stats-grid">
          <div className="story-stat-box">
            <strong>30,000+</strong>
            <small>Sinh viên & Học viên</small>
          </div>
          <div className="story-stat-box">
            <strong>1,200+</strong>
            <small>Giảng viên & Nhà khoa học</small>
          </div>
          <div className="story-stat-box">
            <strong>100%</strong>
            <small>Số hóa quy trình học vụ</small>
          </div>
        </div>

        <div className="story-features-row">
          <span className="feature-pill"><CheckCircle2 size={13} /> Kiểm định quốc tế ABET</span>
          <span className="feature-pill"><CheckCircle2 size={13} /> Dữ liệu học vụ tức thời</span>
          <span className="feature-pill"><CheckCircle2 size={13} /> Bảo mật đa tầng TLS 1.3</span>
        </div>
      </div>

      <div className="story-footer">
        <span>© 2026 Trường Đại học Duy Tân · Duy Tan University</span>
        <span>Hệ thống bảo mật TLS 1.3 · eDTU v2.0 Enterprise</span>
      </div>
      <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
    </section>

    <section className="login-panel">
      <div className="login-panel-top">
        <div className="mobile-brand">
          <img src="/logo-dtu.png" alt="Đại học Duy Tân" className="mobile-dtu-logo" />
        </div>
      </div>

      <div className="login-card">
        <div className="login-card-brand">
          <div className="login-card-emblem-wrap">
            <img src="/logo-dtu-emblem.png" alt="DTU" className="login-card-emblem" />
          </div>
          <div className="login-card-brand-meta">
            <span className="login-card-system-name">eDTU PORTAL</span>
            <span className="login-card-university">TRƯỜNG ĐẠI HỌC DUY TÂN</span>
          </div>
        </div>

        <div className="login-heading">
          <h2>Chào mừng trở lại!</h2>
          <p>Đăng nhập để vào không gian học tập và làm việc của bạn.</p>
        </div>

        {error && (
          <div className="error-alert" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={submit} autoComplete="off">
          <div className="form-group">
            <label className="field-label" htmlFor="login-account">Mã tài khoản (User Code / Email)</label>
            <div className="field-wrap">
              <UserRound size={18} className="field-icon" />
              <input
                id="login-account"
                name="edtu_credential_account"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                value={userCode}
                onChange={(event) => setUserCode(event.target.value)}
                placeholder="VD: student, admin, lecturer..."
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="field-row">
              <label className="field-label" htmlFor="login-password">Mật khẩu</label>
              <button
                type="button"
                className="text-button"
                onClick={() => setError('Quý thầy cô và sinh viên liên hệ Phòng CNTT (ext 101) hoặc cố vấn học tập để đặt lại mật khẩu.')}
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className="field-wrap">
              <LockKeyhole size={18} className="field-icon" />
              <input
                id="login-password"
                name="edtu_credential_password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                data-lpignore="true"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu tài khoản"
                required
              />
              <button
                className="input-action-btn"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button className="primary-button login-submit" type="submit" disabled={submitting}>
            {submitting ? (
              <span className="spinner" />
            ) : (
              <>
                <span>Đăng nhập hệ thống</span>
                <ArrowRight size={18} className="btn-arrow" />
              </>
            )}
          </button>
        </form>

        <div className="login-note-card">
          <ShieldCheck size={18} className="login-note-icon" />
          <span>Hệ thống bảo mật dữ liệu theo quy định đào tạo. Mọi phiên đăng nhập đều được mã hóa và ghi nhật ký kiểm toán IP an toàn.</span>
        </div>
      </div>

      <div className="login-panel-footer">
        <span>© 2026 eDTU · Đại học Duy Tân</span>
        <span>Hỗ trợ kỹ thuật: 0236.3827111 · contact@duytan.edu.vn</span>
      </div>
    </section>
  </main>;
}

// -------------------------------------------------------------
// WORKSPACE SHELL
// -------------------------------------------------------------
function Workspace({ auth }: { auth: AuthState }) {
  const { role: rawRole, section = 'dashboard' } = useParams();
  const role = isPortalRole(rawRole) ? rawRole : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [newsDrawerOpen, setNewsDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    if (auth.session) {
      api<{ items: Record<string, any>[] }>('/api/portal/news')
        .then((res) => setNotifications(res.items || []))
        .catch(() => undefined);
    }
  }, [auth.session]);

  if (auth.loading) return <div className="app-loading"><span className="spinner" /><span>Đang kiểm tra phiên làm việc eDTU…</span></div>;
  if (!auth.session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!role) return <Navigate to={`/${auth.session.activeRole}/dashboard`} replace />;
  if (role !== auth.session.activeRole) return <Navigate to={`/${auth.session.activeRole}/dashboard`} replace />;

  const availableNavigation = navigation[role].filter((item) => canAccessNav(role, item.key, auth.session!.permissions));
  const page = availableNavigation.find((item) => item.key === section);
  if (!page) return <Navigate to={`/${role}/dashboard`} replace />;

  async function switchRole(nextRole: PortalRole) {
    if (!auth.session) return;
    try {
      const result = await api<{ activeRole: PortalRole; csrfToken: string; permissions: string[]; redirectTo: string }>('/api/auth/switch-role',
        { method: 'POST', body: JSON.stringify({ role: nextRole }) }, auth.session.csrfToken);
      auth.setSession({ ...auth.session, activeRole: result.activeRole, csrfToken: result.csrfToken, permissions: result.permissions });
      navigate(result.redirectTo);
      setMobileNav(false);
    } catch (error) {
      window.alert((error as Error).message);
    }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }, auth.session!.csrfToken); }
    catch { /* Continue logout */ }
    auth.setSession(null);
    navigate('/login', { replace: true });
  }

  return <div className="portal-shell">
    {mobileNav && <button className="mobile-backdrop" aria-label="Đóng menu" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <Link to={`/${role}/dashboard`} className="sidebar-brand-box" onClick={() => setMobileNav(false)}>
        <img src="/logo-dtu.png" alt="Đại học Duy Tân - Duy Tan University" className="sidebar-dtu-logo" />
        <div className="sidebar-dtu-sub">
          <span className="portal-sub-name">CỔNG ĐÀO TẠO ĐIỆN TỬ</span>
          <span className="portal-sub-badge">eDTU</span>
        </div>
      </Link>

      <div className="sidebar-role" onClick={() => { if (auth.session && auth.session.roles.length > 1) setRoleMenuOpen(!roleMenuOpen); }}>
        <span className={`role-chip role-${role}`}>{roleInfo[role].short}</span>
        <span>
          <small>KHÔNG GIAN LÀM VIỆC</small>
          <strong>{roleInfo[role].unit}</strong>
        </span>
        {auth.session.roles.length > 1 ? <ChevronDown size={15} /> : <span className="active-dot" />}
      </div>

      <nav className="sidebar-nav" aria-label={`Điều hướng ${roleInfo[role].label}`}>
        {groupNav(availableNavigation).map(([group, items]) => <div className="nav-group" key={group}>
          <div className="nav-group-title">{group}</div>
          {items.map((item) => <Link
            key={item.key}
            to={`/${role}/${item.key}`}
            className={`nav-link ${item.key === section ? 'active' : ''}`}
            onClick={() => setMobileNav(false)}
          >
            <item.icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
            {item.badge && <span className="nav-pill-badge">{item.badge}</span>}
          </Link>)}
        </div>)}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <span className="help-icon"><LifeBuoy size={17} /></span>
          <span>
            <strong>Trợ giúp & Hỗ trợ</strong>
            <small>Hotline: 0236.3827111</small>
          </span>
          <ArrowUpRight size={14} />
        </div>
        <button className="sidebar-account" onClick={logout} title="Đăng xuất khỏi hệ thống">
          <span className="avatar">{auth.session.user.full_name.slice(0, 1).toUpperCase()}</span>
          <span className="account-copy">
            <strong>{auth.session.user.full_name}</strong>
            <small>{auth.session.user.user_code} · {roleInfo[role].label}</small>
          </span>
          <LogOut size={16} />
        </button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu-button" aria-label="Mở menu" onClick={() => setMobileNav(true)}>
          <Menu size={21} />
        </button>

        <div className="breadcrumb">
          <span>{roleInfo[role].label}</span>
          <ChevronRight size={14} />
          <strong>{page.label}</strong>
        </div>

        <div className="topbar-actions">
          <div className="term-pill">
            <span className="term-dot live" />
            <span>Học kỳ 1 · Năm học 2026–2027</span>
          </div>

          {auth.session.roles.length > 1 && <div className="role-switcher">
            <button
              className="role-switch-button"
              aria-label="Chuyển không gian làm việc"
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            >
              <RefreshCw size={13} />
              <span>Đổi vai trò</span>
              <ChevronDown size={13} />
            </button>
            {roleMenuOpen && <div className="role-menu">
              <div className="role-menu-header">Chọn vai trò tiếp tục:</div>
              {auth.session.roles.map((item) => <button
                key={item.name}
                className={item.name === role ? 'active' : ''}
                onClick={() => { setRoleMenuOpen(false); void switchRole(item.name); }}
              >
                <span className={`role-chip mini role-${item.name}`}>{roleInfo[item.name].short}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.name === role ? 'Đang kích hoạt' : 'Chuyển không gian'}</small>
                </span>
                {item.name === role && <Check size={14} />}
              </button>)}
            </div>}
          </div>}

          <button
            className="icon-button notification-button"
            aria-label="Xem thông báo"
            title="Xem thông báo mới"
            onClick={() => setNewsDrawerOpen(true)}
          >
            <Bell size={18} />
            {notifications.length > 0 && <span className="unread-dot" />}
          </button>

          <Link to={`/${role}/profile`} className="topbar-user-badge" title="Xem hồ sơ cá nhân">
            <span className="topbar-avatar">{auth.session.user.full_name.slice(0, 1).toUpperCase()}</span>
            <div className="topbar-user-info">
              <strong>{auth.session.user.full_name}</strong>
              <small>{auth.session.user.user_code}</small>
            </div>
          </Link>
        </div>
      </header>

      {/* NOTIFICATIONS DRAWER / MODAL */}
      {newsDrawerOpen && <div className="password-overlay">
        <section className="notifications-modal surface">
          <div className="modal-header">
            <div>
              <div className="section-kicker">TRUNG TÂM TIN TỨC & THÔNG BÁO</div>
              <h3>Thông báo từ Nhà trường ({notifications.length})</h3>
            </div>
            <button className="icon-button" onClick={() => setNewsDrawerOpen(false)}><X size={16} /></button>
          </div>
          <div className="notifications-list">
            {notifications.map((n) => <article key={n.id} className="notification-card">
              <div className="notif-top">
                <span className="notif-badge"><Newspaper size={13} /> Tin tức</span>
                <span className="notif-time">{formatDate(n.published_at)}</span>
              </div>
              <h4>{n.title}</h4>
              <p>{n.body}</p>
            </article>)}
          </div>
          <div className="modal-footer">
            <button className="secondary-button" onClick={() => setNewsDrawerOpen(false)}>Đóng</button>
            <Link to={`/${role}/news`} className="primary-button" onClick={() => setNewsDrawerOpen(false)}>
              Xem tất cả thông báo <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>}

      {auth.session.mustChangePassword && <PasswordChange session={auth.session} onChanged={(csrfToken) => auth.setSession({ ...auth.session!, csrfToken, mustChangePassword: false })} />}
      <div className="content-area">
        <PageView role={role} section={section} session={auth.session} />
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Hiển thị mượt mà trên điện thoại và máy tính bảng) */}
      <nav className="mobile-bottom-bar" aria-label="Điều hướng nhanh di động">
        {role === 'student' && <>
          <Link to="/student/dashboard" className={`mobile-tab ${section === 'dashboard' ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Tổng quan</span>
          </Link>
          <Link to="/student/schedule" className={`mobile-tab ${section === 'schedule' ? 'active' : ''}`}>
            <CalendarDays size={20} />
            <span>Lịch học</span>
          </Link>
          <Link to="/student/grades" className={`mobile-tab ${section === 'grades' ? 'active' : ''}`}>
            <TableProperties size={20} />
            <span>Điểm thi</span>
          </Link>
          <Link to="/student/profile" className={`mobile-tab ${section === 'profile' ? 'active' : ''}`}>
            <UserRound size={20} />
            <span>Thẻ SV</span>
          </Link>
          <button type="button" className="mobile-tab" onClick={() => setMobileNav(true)} aria-label="Mở menu chức năng đầy đủ">
            <Menu size={20} />
            <span>Thêm</span>
          </button>
        </>}
        {role === 'lecturer' && <>
          <Link to="/lecturer/dashboard" className={`mobile-tab ${section === 'dashboard' ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Tổng quan</span>
          </Link>
          <Link to="/lecturer/schedule" className={`mobile-tab ${section === 'schedule' ? 'active' : ''}`}>
            <CalendarDays size={20} />
            <span>Lịch dạy</span>
          </Link>
          <Link to="/lecturer/grades" className={`mobile-tab ${section === 'grades' ? 'active' : ''}`}>
            <TableProperties size={20} />
            <span>Sổ điểm</span>
          </Link>
          <Link to="/lecturer/profile" className={`mobile-tab ${section === 'profile' ? 'active' : ''}`}>
            <UserRound size={20} />
            <span>Hồ sơ</span>
          </Link>
          <button type="button" className="mobile-tab" onClick={() => setMobileNav(true)} aria-label="Mở menu chức năng">
            <Menu size={20} />
            <span>Thêm</span>
          </button>
        </>}
        {role === 'staff' && <>
          <Link to="/staff/dashboard" className={`mobile-tab ${section === 'dashboard' ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Tổng quan</span>
          </Link>
          <Link to="/staff/requests" className={`mobile-tab ${section === 'requests' ? 'active' : ''}`}>
            <LifeBuoy size={20} />
            <span>Yêu cầu</span>
          </Link>
          <Link to="/staff/tasks" className={`mobile-tab ${section === 'tasks' ? 'active' : ''}`}>
            <ClipboardCheck size={20} />
            <span>Công việc</span>
          </Link>
          <Link to="/staff/profile" className={`mobile-tab ${section === 'profile' ? 'active' : ''}`}>
            <UserRound size={20} />
            <span>Hồ sơ</span>
          </Link>
          <button type="button" className="mobile-tab" onClick={() => setMobileNav(true)} aria-label="Mở menu chức năng">
            <Menu size={20} />
            <span>Thêm</span>
          </button>
        </>}
        {role === 'admin' && <>
          <Link to="/admin/dashboard" className={`mobile-tab ${section === 'dashboard' ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Tổng quan</span>
          </Link>
          <Link to="/admin/users" className={`mobile-tab ${section === 'users' ? 'active' : ''}`}>
            <Users size={20} />
            <span>Tài khoản</span>
          </Link>
          <Link to="/admin/schedule" className={`mobile-tab ${section === 'schedule' ? 'active' : ''}`}>
            <CalendarDays size={20} />
            <span>Lớp học</span>
          </Link>
          <Link to="/admin/audit" className={`mobile-tab ${section === 'audit' ? 'active' : ''}`}>
            <FileClock size={20} />
            <span>Kiểm toán</span>
          </Link>
          <button type="button" className="mobile-tab" onClick={() => setMobileNav(true)} aria-label="Mở menu quản trị">
            <Menu size={20} />
            <span>Thêm</span>
          </button>
        </>}
      </nav>
    </main>
  </div>;
}

// -------------------------------------------------------------
// DASHBOARD VIEW
// -------------------------------------------------------------
function Dashboard({ role, session }: { role: PortalRole; session: Session }) {
  const [data, setData] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [activeNews, setActiveNews] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    api<Record<string, any>>('/api/dashboard')
      .then(setData)
      .catch((reason) => setError((reason as Error).message));
  }, []);

  const date = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  const cardSet = dashboardCards(role, { ...(data?.counts || {}), announcements: data?.announcements?.length || 0 });

  return <div className="page-stack dashboard-page">
    <div className="page-heading dash-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> {date.toUpperCase()}</div>
        <h1>Xin chào, {session.user.full_name} <span className="wave">👋</span></h1>
        <p>{dashboardSubtitle[role]}</p>
      </div>
      <div className="heading-meta">
        <span className="semester-icon"><CalendarDays size={18} /></span>
        <span>
          <small>HỌC KỲ HIỆN TẠI</small>
          <strong>Học kỳ 1 · 2026–2027</strong>
        </span>
      </div>
    </div>

    {/* HERO ROLE BANNER */}
    <div className={`role-banner banner-${role}`}>
      <div className="banner-copy">
        <span className="banner-kicker"><Sparkles size={14} /> KHÔNG GIAN {roleInfo[role].label.toUpperCase()} · eDTU 2.0</span>
        <h2>{bannerTitle[role]}</h2>
        <p>{bannerDescription[role]}</p>
        <div className="banner-actions">
          {role === 'student' && <>
            <Link to="/student/enrollment" className="banner-button primary"><BookOpen size={15} /> Đăng ký học phần ngay</Link>
            <Link to="/student/schedule" className="banner-button secondary"><CalendarDays size={15} /> Xem thời khóa biểu</Link>
          </>}
          {role === 'lecturer' && <>
            <Link to="/lecturer/grades" className="banner-button primary"><TableProperties size={15} /> Quản lý bảng điểm</Link>
            <Link to="/lecturer/attendance" className="banner-button secondary"><ClipboardList size={15} /> Điểm danh buổi học</Link>
          </>}
          {role === 'staff' && <>
            <Link to="/staff/requests" className="banner-button primary"><LifeBuoy size={15} /> Xử lý yêu cầu sinh viên</Link>
            <Link to="/staff/tasks" className="banner-button secondary"><ClipboardCheck size={15} /> Công việc được giao</Link>
          </>}
          {role === 'admin' && <>
            <Link to="/admin/schedule" className="banner-button primary"><CalendarDays size={15} /> Lớp & Thời khóa biểu</Link>
            <Link to="/admin/users" className="banner-button secondary"><Users size={15} /> Quản trị người dùng</Link>
          </>}
        </div>
      </div>
      <div className="banner-art" aria-hidden="true">
        <span className="banner-orbit orbit-a" />
        <span className="banner-orbit orbit-b" />
        <span className="banner-symbol">{roleInfo[role].short}</span>
      </div>
      <span className="banner-seal"><BadgeCheck size={16} /> DTU VERIFIED SYSTEM</span>
    </div>

    {error && <InlineAlert message={error} />}

    {/* STAT CARDS */}
    <div className="stat-grid">
      {cardSet.map((card, index) => <StatCard key={card.label} {...card} delay={index} />)}
    </div>

    {/* MAIN DASHBOARD CONTENT */}
    <div className="dashboard-grid">
      <section className="surface schedule-panel">
        <div className="section-heading">
          <div>
            <div className="section-kicker">LỊCH TRÌNH & NHIỆM VỤ</div>
            <h3>
              {role === 'lecturer' ? 'Lớp học phần phụ trách' :
               role === 'staff' ? 'Công việc ưu tiên xử lý' :
               role === 'admin' ? 'Nhật ký hoạt động quản trị gần đây' : 'Lịch học trong tuần'}
            </h3>
          </div>
          <Link
            className="subtle-link"
            to={`/${role}/${role === 'lecturer' ? 'classes' : role === 'staff' ? 'tasks' : role === 'admin' ? 'audit' : 'schedule'}`}
          >
            Xem tất cả <ArrowRight size={14} />
          </Link>
        </div>

        {role === 'lecturer' ? <ClassList items={data?.classes || []} /> :
         role === 'staff' ? <TaskList items={data?.tasks || []} /> :
         role === 'admin' ? <AuditList items={data?.recentAudit || []} /> :
         <ScheduleList items={data?.schedule || []} />}
      </section>

      <section className="surface announcements-panel">
        <div className="section-heading">
          <div>
            <div className="section-kicker">CẬP NHẬT MỚI NHẤT</div>
            <h3>Thông báo nhà trường</h3>
          </div>
          <Link className="subtle-link" to={`/${role}/news`}>Xem bảng tin <ArrowRight size={14} /></Link>
        </div>

        {data?.announcements?.length ? (
          <div className="announcement-list">
            {data.announcements.map((item: any) => (
              <article
                className="announcement-item interactive"
                key={item.id}
                onClick={() => setActiveNews(item)}
              >
                <span className="announcement-mark"><Newspaper size={16} /></span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{formatDate(item.published_at)} · Bấm để xem chi tiết</small>
                </span>
                <ChevronRight size={14} className="trailing-icon" />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Newspaper} title="Chưa có thông báo mới" description="Thông báo được nhà trường công bố sẽ xuất hiện tại đây." compact />
        )}
        <div className="announcement-foot">
          <span className="status-live" /> Đồng bộ tự động từ Cổng Thông tin Điện tử DTU
        </div>
      </section>
    </div>

    {/* ANNOUNCEMENT DETAIL MODAL */}
    {activeNews && <div className="password-overlay">
      <section className="news-detail-modal surface">
        <div className="modal-header">
          <div>
            <div className="section-kicker">CHI TIẾT THÔNG BÁO</div>
            <h3>{activeNews.title}</h3>
            <small>Ngày công bố: {formatDateTime(activeNews.published_at)}</small>
          </div>
          <button className="icon-button" onClick={() => setActiveNews(null)}><X size={16} /></button>
        </div>
        <div className="news-modal-body">
          <p>{activeNews.body}</p>
        </div>
        <div className="modal-footer">
          <button className="primary-button" onClick={() => setActiveNews(null)}>Đã đọc & Đóng</button>
        </div>
      </section>
    </div>}
  </div>;
}

const dashboardSubtitle: Record<PortalRole, string> = {
  student: 'Theo dõi tiến độ học tập, lịch trình lớp học và các dịch vụ sinh viên.',
  lecturer: 'Quản lý lịch giảng dạy, lớp học phần, chấm bài tập và điểm số sinh viên.',
  staff: 'Theo dõi nhiệm vụ được giao, tiếp nhận và giải quyết yêu cầu sinh viên một cửa.',
  admin: 'Quản lý tài khoản, đào tạo, lớp học vụ và giám sát toàn hệ thống.',
};
const bannerTitle: Record<PortalRole, string> = {
  student: 'Học kỳ 1 năm học 2026–2027 đang diễn ra.',
  lecturer: 'Đồng hành cùng tri thức, vững bước tương lai.',
  staff: 'Mọi quy trình minh bạch, giải quyết đúng tiến độ.',
  admin: 'Hệ thống vận hành an toàn, chính xác và toàn diện.',
};
const bannerDescription: Record<PortalRole, string> = {
  student: 'Cổng eDTU kết nối thời khóa biểu, kết quả thi, bài tập và học phí trực tuyến tại một nơi.',
  lecturer: 'Quản lý sổ điểm điện tử, tạo buổi điểm danh và gửi phê duyệt điểm nhanh chóng.',
  staff: 'Xử lý các nghiệp vụ đào tạo, chứng nhận sinh viên và đối soát học phí theo phân quyền.',
  admin: 'Quản lý phân quyền RBAC, kiểm toán nhật ký an toàn và phê duyệt điểm học kỳ.',
};

function dashboardCards(role: PortalRole, counts: Record<string, number>) {
  if (role === 'student') return [
    { label: 'Học phần đang học', value: counts.enrolled || 4, caption: 'Theo đăng ký học kỳ này', icon: BookOpen, color: 'red' },
    { label: 'Điểm GPA Tích lũy', value: '3.68', caption: 'Xếp loại: Giỏi (Hệ 4)', icon: Award, color: 'blue' },
    { label: 'Học phí cần nộp', value: '14.850.000 ₫', caption: 'Hạn cuối: 31/12/2026', icon: WalletCards, color: 'amber' },
    { label: 'Yêu cầu đang xử lý', value: counts.open_requests || 1, caption: 'Tiến độ xử lý một cửa', icon: LifeBuoy, color: 'green' },
  ];
  if (role === 'lecturer') return [
    { label: 'Lớp đang phụ trách', value: counts.classes || 3, caption: 'Theo phân công giảng dạy', icon: BookOpen, color: 'red' },
    { label: 'Sinh viên đang dạy', value: counts.students || 45, caption: 'Trong các lớp được giao', icon: Users, color: 'blue' },
    { label: 'Bài tập cần chấm', value: counts.pending_grading || 2, caption: 'Bài nộp mới của sinh viên', icon: ClipboardCheck, color: 'amber' },
    { label: 'Bảng điểm chờ duyệt', value: '1 lớp', caption: 'CS303.01 đang chờ Admin', icon: TableProperties, color: 'green' },
  ];
  if (role === 'staff') return [
    { label: 'Công việc cần làm', value: counts.tasks || 3, caption: 'Nhiệm vụ được giao', icon: ClipboardCheck, color: 'red' },
    { label: 'Yêu cầu sinh viên', value: counts.requests || 2, caption: 'Hồ sơ cần xử lý trong tuần', icon: LifeBuoy, color: 'blue' },
    { label: 'Đơn vị công tác', value: 'Phòng Đào tạo', caption: 'Đại học Duy Tân', icon: Building2, color: 'amber' },
    { label: 'Trạng thái phân quyền', value: 'Đã kích hoạt', caption: 'Phạm vi toàn trường', icon: ShieldCheck, color: 'green' },
  ];
  return [
    { label: 'Tổng tài khoản', value: counts.accounts || 11, caption: 'Đang hoạt động trong hệ thống', icon: Users, color: 'red' },
    { label: 'Sinh viên', value: counts.students || 4, caption: 'Đã khởi tạo hồ sơ', icon: GraduationCap, color: 'blue' },
    { label: 'Giảng viên', value: counts.lecturers || 3, caption: 'Đã phân công giảng dạy', icon: BookOpen, color: 'amber' },
    { label: 'Nhật ký kiểm toán', value: counts.audit_today || 7, caption: 'Ghi nhận trong 24 giờ qua', icon: FileClock, color: 'green' },
  ];
}

function StatCard({ label, value, caption, icon: Icon, color, delay }: { label: string; value: string | number; caption: string; icon: LucideIcon; color: string; delay: number }) {
  return <div className={`stat-card stat-${color}`} style={{ animationDelay: `${delay * 60}ms` }}>
    <div className="stat-top">
      <span>{label}</span>
      <span className="stat-icon"><Icon size={19} /></span>
    </div>
    <strong className="stat-value">{value}</strong>
    <div className="stat-caption">
      <span className="stat-caption-dot" />
      {caption}
    </div>
    <span className="stat-card-line" />
  </div>;
}

// -------------------------------------------------------------
// PAGE ROUTER
// -------------------------------------------------------------
function PageView({ role, section, session }: { role: PortalRole; section: string; session: Session }) {
  const navItem = navigation[role].find((item) => item.key === section)!;
  if (section === 'dashboard') return <Dashboard role={role} session={session} />;

  // Student specialized pages
  if (role === 'student' && section === 'profile') return <StudentProfilePage session={session} />;
  if (role === 'student' && section === 'schedule') return <StudentSchedulePage session={session} />;
  if (role === 'student' && section === 'enrollment') return <StudentEnrollmentPage session={session} />;
  if (role === 'student' && section === 'grades') return <StudentGradesPage session={session} />;
  if (role === 'student' && section === 'curriculum') return <StudentCurriculumPage session={session} />;
  if (role === 'student' && section === 'assignments') return <StudentAssignmentsPage session={session} />;
  if (role === 'student' && (section === 'tuition' || section === 'payments')) return <StudentTuitionPage session={session} initialTab={section === 'payments' ? 'pay' : 'summary'} />;
  if (role === 'student' && (section === 'requests' || section === 'services')) return <StudentServicesPage session={session} />;
  if (role === 'student' && (section === 'syllabus' || section === 'library')) return <StudentLibraryPage section={section} session={session} />;

  // Lecturer specialized pages
  if (role === 'lecturer' && section === 'classes') return <LecturerClassesPage session={session} />;
  if (role === 'lecturer' && section === 'grades') return <LecturerGradesPage session={session} />;
  if (role === 'lecturer' && section === 'assignments') return <LecturerAssignmentsPage session={session} />;
  if (role === 'lecturer' && section === 'attendance') return <LecturerAttendancePage session={session} />;

  // Staff specialized pages
  if (role === 'staff' && (section === 'requests' || section === 'tasks')) return <StaffWorkPage section={section} session={session} />;
  if (role === 'staff' && section === 'operations') return <StaffOperationsPage session={session} />;
  if (role === 'staff' && section === 'reports') return <StaffReportsPage session={session} />;

  // Admin specialized pages
  if (role === 'admin' && section === 'users') return <UsersPage session={session} />;
  if (role === 'admin' && section === 'permissions') return <PermissionsPage session={session} />;
  if (role === 'admin' && section === 'units') return <UnitsPage session={session} />;
  if (role === 'admin' && ['education', 'courses', 'schedule'].includes(section)) return <AdminAcademicPage section={section} session={session} />;
  if (role === 'admin' && section === 'grades') return <Navigate to="/admin/dashboard" replace />;
  if (role === 'admin' && section === 'finance') return <AdminFinancePage session={session} />;
  if (role === 'admin' && section === 'audit') return <AdminAuditPage session={session} />;

  // General news and settings
  if (section === 'news') return <NewsFeedPage role={role} session={session} />;
  if (section === 'settings') return <AccountSettingsPage role={role} session={session} />;

  return <DataPage role={role} section={section} title={navItem.label} session={session} />;
}

// -------------------------------------------------------------
// STUDENT SPECIALIZED MODULES
// -------------------------------------------------------------
function StudentProfilePage({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/profile')
      .then((res) => { if (res.items?.[0]) setProfile(res.items[0]); })
      .finally(() => setLoading(false));
  }, []);

  return <div className="page-stack">
    <PageHeader
      eyebrow="CỔNG SINH VIÊN DUY TÂN"
      title="Hồ sơ cá nhân & Thẻ sinh viên điện tử"
      subtitle="Thông tin sinh viên, chương trình đào tạo chuẩn kiểm định ABET và thẻ số tích hợp."
    />

    <div className="profile-layout-grid">
      {/* DIGITAL STUDENT CARD */}
      <section className="student-id-card-wrapper">
        <div className="dtu-student-card">
          <div className="card-top">
            <div className="card-brand">
              <img src="/logo-dtu-emblem.png" alt="DTU Logo" className="card-logo-emblem" />
              <div>
                <strong>TRƯỜNG ĐẠI HỌC DUY TÂN</strong>
                <small>DUY TAN UNIVERSITY · DA NANG, VIETNAM</small>
              </div>
            </div>
            <span className="card-type-chip">THẺ SINH VIÊN</span>
          </div>

          <div className="card-body">
            <div className="card-avatar-box">
              <span className="card-avatar-img">{session.user.full_name.slice(0, 1)}</span>
              <span className="card-active-tag">HỢP LỆ</span>
            </div>
            <div className="card-details">
              <h3 className="card-student-name">{session.user.full_name}</h3>
              <div className="card-info-row">
                <span>MÃ SV:</span>
                <strong>{profile.user_code || session.user.user_code}</strong>
              </div>
              <div className="card-info-row">
                <span>NGÀNH HỌC:</span>
                <strong>{profile.major || 'Kỹ thuật Phần mềm (CMU)'}</strong>
              </div>
              <div className="card-info-row">
                <span>KHOA:</span>
                <strong>{profile.faculty || 'Khoa Công nghệ Thông tin'}</strong>
              </div>
              <div className="card-info-row">
                <span>KHÓA / NIÊN KHÓA:</span>
                <strong>{profile.cohort || 'K28'} · {profile.enrollment_year || 2023}–2027</strong>
              </div>
            </div>
          </div>

          <div className="card-bottom">
            <div className="card-barcode">
              <div className="barcode-lines" />
              <span>{profile.user_code || session.user.user_code}</span>
            </div>
            <div className="card-qr-box">
              <QrCode size={36} />
              <small>DTU QR ID</small>
            </div>
          </div>
        </div>
      </section>

      {/* DETAILED INFO CARDS */}
      <div className="profile-details-column">
        <section className="surface p-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker">THÔNG TIN HỌC VỤ CHÍNH THỨC</div>
              <h3>Tiến độ đào tạo</h3>
            </div>
            <span className="status-pill status-active">Đang theo học chính khóa</span>
          </div>
          <div className="detail-meta-grid">
            <div className="meta-item">
              <label>Hệ đào tạo</label>
              <strong>Đại học Chính quy (4 năm)</strong>
            </div>
            <div className="meta-item">
              <label>Chương trình</label>
              <strong>Chương trình Tiên tiến hợp tác ĐH Carnegie Mellon (Mỹ)</strong>
            </div>
            <div className="meta-item">
              <label>Cố vấn học tập</label>
              <strong>TS. Trần Hoàng Việt (Khoa CNTT)</strong>
            </div>
            <div className="meta-item">
              <label>Email nhà trường</label>
              <strong>{session.user.email}</strong>
            </div>
          </div>
        </section>

        <section className="surface p-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker">KẾT QUẢ ĐÀO TẠO TÍCH LŨY</div>
              <h3>Xếp loại học lực & Rèn luyện</h3>
            </div>
          </div>
          <div className="stat-strip">
            <div className="strip-item">
              <small>Điểm TBC tích lũy (Hệ 10)</small>
              <strong>8.72 / 10</strong>
            </div>
            <div className="strip-item">
              <small>Điểm GPA tích lũy (Hệ 4)</small>
              <strong className="text-red">3.68 / 4.0</strong>
            </div>
            <div className="strip-item">
              <small>Tín chỉ tích lũy</small>
              <strong>48 / 135 TC</strong>
            </div>
            <div className="strip-item">
              <small>Điểm Rèn luyện kỳ gần nhất</small>
              <strong>88 / 100 (Tốt)</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

function StudentSchedulePage({ session: _session }: { session: Session }) {
  const [schedules, setSchedules] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/schedule')
      .then((res) => setSchedules(res.items || []))
      .finally(() => setLoading(false));
  }, []);

  const days = [
    { num: 1, name: 'Thứ 2' },
    { num: 2, name: 'Thứ 3' },
    { num: 3, name: 'Thứ 4' },
    { num: 4, name: 'Thứ 5' },
    { num: 5, name: 'Thứ 6' },
    { num: 6, name: 'Thứ 7' },
  ];

  return <div className="page-stack">
    <PageHeader
      eyebrow="HỌC TẬP & ĐÀO TẠO"
      title="Thời khóa biểu sinh viên"
      subtitle="Lịch học các lớp học phần bạn đã đăng ký chính thức trong Học kỳ 1 (2026–2027)."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Thời khóa biểu tuần</h3>
          <span>Hiển thị theo ca học và phòng học tại các cơ sở Đại học Duy Tân</span>
        </div>
        <div className="toolbar-actions">
          <div className="tab-pill-group">
            <button className={viewMode === 'matrix' ? 'active' : ''} onClick={() => setViewMode('matrix')}>
              <CalendarDays size={14} /> Dạng lưới tuần
            </button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
              <TableProperties size={14} /> Dạng danh sách
            </button>
          </div>
          <button className="secondary-button" onClick={() => window.print()}>
            <Download size={14} /> In / Xuất PDF
          </button>
        </div>
      </div>

      {loading ? <LoadingRows /> : viewMode === 'matrix' ? (
        <div className="timetable-matrix-grid">
          {days.map((day) => {
            const dayClasses = schedules.filter((s) => Number(s.weekday) === day.num);
            return <div className="matrix-day-col" key={day.num}>
              <div className="matrix-day-header">
                <strong>{day.name}</strong>
                <small>{dayClasses.length} tiết học</small>
              </div>
              <div className="matrix-day-body">
                {dayClasses.length ? dayClasses.map((item, idx) => (
                  <div className="matrix-class-card" key={idx}>
                    <div className="class-time-badge">
                      <Clock size={12} /> {item.start_time} – {item.end_time}
                    </div>
                    <strong>{item.course}</strong>
                    <div className="class-section-code">{item.section}</div>
                    <div className="class-room-badge">
                      <Building2 size={12} /> Phòng: {item.room || 'Chưa xếp phòng'}
                    </div>
                  </div>
                )) : (
                  <div className="matrix-empty-day">Không có tiết</div>
                )}
              </div>
            </div>;
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Thứ</th>
                <th>Khung giờ</th>
                <th>Mã học phần</th>
                <th>Tên học phần</th>
                <th>Mã lớp</th>
                <th>Phòng học</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, idx) => (
                <tr key={idx}>
                  <td><strong>{['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][Number(s.weekday) - 1]}</strong></td>
                  <td><span className="time-pill">{s.start_time} – {s.end_time}</span></td>
                  <td><code>{s.course_code}</code></td>
                  <td><strong>{s.course}</strong></td>
                  <td>{s.section}</td>
                  <td><span className="room-pill">{s.room || 'Chưa xếp phòng'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </div>;
}

function StudentEnrollmentPage({ session }: { session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/enrollment');
      setItems(res.items || []);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const enrolledCount = items.filter((item) => item.is_enrolled).length;
  const enrolledCredits = items.filter((item) => item.is_enrolled).reduce((acc, curr) => acc + (Number(curr.credits) || 0), 0);

  async function enroll(item: Record<string, any>) {
    setBusyId(item.id);
    setError('');
    setSuccess('');
    try {
      await api('/api/enrollments', { method: 'POST', body: JSON.stringify({ sectionId: item.id }) }, session.csrfToken);
      setSuccess(`Đăng ký thành công lớp học phần ${item.course} (${item.section})!`);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function drop(item: Record<string, any>) {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy đăng ký lớp ${item.section} (${item.course})?`)) return;
    setBusyId(item.id);
    setError('');
    setSuccess('');
    try {
      await api(`/api/enrollments/${item.id}`, { method: 'DELETE' }, session.csrfToken);
      setSuccess(`Đã hủy đăng ký lớp học phần ${item.section}.`);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return <div className="page-stack">
    <PageHeader
      eyebrow="HỌC VỤ TRỰC TUYẾN"
      title="Đăng ký học phần (Course Registration)"
      subtitle="Đợt đăng ký Học kỳ 1 (2026–2027) đang mở. Máy chủ kiểm tra điều kiện trùng lịch và sĩ số lớp."
    />

    {/* CREDIT TRACKER BANNER */}
    <div className="enrollment-tracker-card">
      <div className="tracker-stat">
        <span className="tracker-label">Số học phần đã đăng ký</span>
        <strong>{enrolledCount} môn</strong>
      </div>
      <div className="tracker-progress-box">
        <div className="tracker-progress-header">
          <span>Số tín chỉ đăng ký: <strong>{enrolledCredits} / 24 TC tối đa</strong></span>
          <small>{enrolledCredits >= 14 ? '✓ Đạt mức tối thiểu (14 TC)' : '⚠️ Cần đăng ký tối thiểu 14 TC'}</small>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${Math.min(100, (enrolledCredits / 24) * 100)}%` }} />
        </div>
      </div>
    </div>

    {success && <div className="success-alert"><CheckCircle2 size={16} /><span>{success}</span></div>}
    {error && <InlineAlert message={error} />}

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Danh sách lớp học phần đang mở đăng ký</h3>
          <span>Thời gian mở: 01/08/2026 đến hết 28/02/2027</span>
        </div>
        <span className="status-pill status-active"><Sparkles size={13} /> Đợt đăng ký đang MỞ</span>
      </div>

      {loading ? <LoadingRows /> : items.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Học phần</th>
                <th>Mã lớp</th>
                <th>Số TC</th>
                <th>Học kỳ</th>
                <th>Phòng học</th>
                <th>Sĩ số / Chỗ trống</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const remaining = item.capacity == null ? 'Không giới hạn' : Math.max(0, Number(item.capacity) - Number(item.enrolled_count));
                const isFull = item.capacity != null && remaining === 0;
                return <tr key={item.id} className={item.is_enrolled ? 'enrolled-row' : ''}>
                  <td>
                    <div className="course-cell">
                      <strong>{item.course}</strong>
                      <small>Mã: {item.course_code}</small>
                    </div>
                  </td>
                  <td><code>{item.section}</code></td>
                  <td><span className="credit-badge">{item.credits} TC</span></td>
                  <td>{item.term} · {item.academic_year}</td>
                  <td>{item.room || 'Chưa xếp phòng'}</td>
                  <td>
                    <span className={`seats-badge ${isFull ? 'full' : ''}`}>
                      {item.enrolled_count} / {item.capacity || '∞'} ({remaining} chỗ)
                    </span>
                  </td>
                  <td>
                    {item.is_enrolled ? (
                      <button
                        className="small-danger"
                        disabled={busyId === item.id}
                        onClick={() => void drop(item)}
                      >
                        {busyId === item.id ? 'Đang hủy…' : 'Đã đăng ký · Hủy'}
                      </button>
                    ) : (
                      <button
                        className="small-primary"
                        disabled={isFull || busyId === item.id}
                        onClick={() => void enroll(item)}
                      >
                        {busyId === item.id ? 'Đang lưu…' : isFull ? 'Lớp đã đầy' : '+ Đăng ký'}
                      </button>
                    )}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={BookOpen} title="Không có lớp nào đang mở đăng ký" description="Các lớp học phần sẽ hiển thị khi nhà trường kích hoạt đợt đăng ký." />
      )}
    </section>
  </div>;
}

function StudentGradesPage({ session: _session }: { session: Session }) {
  const [grades, setGrades] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/grades')
      .then((res) => setGrades(res.items || []))
      .finally(() => setLoading(false));
  }, []);

  return <div className="page-stack">
    <PageHeader
      eyebrow="KẾT QUẢ ĐÀO TẠO"
      title="Bảng điểm học tập & Điểm tổng kết"
      subtitle="Bảng điểm chính thức các học phần đã được Hội đồng Đào tạo Đại học Duy Tân phê duyệt."
    />

    {/* GPA SUMMARY CARDS */}
    <div className="gpa-kpi-grid">
      <div className="gpa-card">
        <span className="gpa-card-title">Điểm trung bình hệ 10</span>
        <strong className="gpa-value">8.72</strong>
        <span className="gpa-status good">Học lực: Giỏi</span>
      </div>
      <div className="gpa-card">
        <span className="gpa-card-title">Điểm GPA tích lũy hệ 4</span>
        <strong className="gpa-value text-red">3.68</strong>
        <span className="gpa-status good">Xếp loại: Xuất sắc</span>
      </div>
      <div className="gpa-card">
        <span className="gpa-card-title">Tổng tín chỉ tích lũy</span>
        <strong className="gpa-value">48</strong>
        <span className="gpa-status neutral">Đạt chuẩn tiến độ K28</span>
      </div>
      <div className="gpa-card">
        <span className="gpa-card-title">Học bổng khuyến khích</span>
        <strong className="gpa-value text-green">Đạt</strong>
        <span className="gpa-status good">Loại: Giỏi (Kỳ 1)</span>
      </div>
    </div>

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Chi tiết điểm các thành phần học phần</h3>
          <span>Chuyên cần (10%), Thực hành Lab (20%), Giữa kỳ (20%), Cuối kỳ (50%)</span>
        </div>
        <span className="status-pill status-active"><BadgeCheck size={14} /> Điểm đã phê duyệt</span>
      </div>

      {loading ? <LoadingRows /> : grades.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Học phần</th>
                <th>Mã lớp</th>
                <th>Học kỳ</th>
                <th>Thành phần điểm</th>
                <th>Điểm số (0–10)</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g, idx) => (
                <tr key={idx}>
                  <td>
                    <div className="course-cell">
                      <strong>{g.course}</strong>
                      <small>{g.course_code}</small>
                    </div>
                  </td>
                  <td><code>{g.section}</code></td>
                  <td>{g.term}</td>
                  <td><strong>{g.component}</strong></td>
                  <td>
                    <span className={`score-badge ${Number(g.score) >= 8.5 ? 'high' : ''}`}>
                      {g.score !== null ? Number(g.score).toFixed(1) : '—'}
                    </span>
                  </td>
                  <td><StatusBadge status={g.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={TableProperties} title="Chưa có điểm được phê duyệt" description="Điểm học phần sẽ hiển thị sau khi giảng viên nhập và Admin duyệt bảng điểm." />
      )}
    </section>
  </div>;
}

function StudentCurriculumPage({ session: _session }: { session: Session }) {
  const [_courses, setCourses] = useState<Record<string, any>[]>([]);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/curriculum')
      .then((res) => setCourses(res.items || []))
      .finally(() => setLoading(false));
  }, []);

  const roadmapSemesters = [
    {
      term: 'Học kỳ 1 (Năm 1)',
      status: 'completed',
      courses: [
        { code: 'MATH101', name: 'Toán Rời rạc & Đại số Tuyến tính', credits: 3, grade: '8.8 (A)' },
        { code: 'ENG101', name: 'Tiếng Anh Chuyên ngành CNTT 1', credits: 3, grade: '8.5 (A)' },
        { code: 'CS101', name: 'Lập trình Hướng đối tượng (C++)', credits: 3, grade: '9.0 (A+)' },
      ],
    },
    {
      term: 'Học kỳ 2 (Năm 1)',
      status: 'completed',
      courses: [
        { code: 'CS202', name: 'Cấu trúc Dữ liệu & Giải thuật', credits: 4, grade: '8.5 (A)' },
        { code: 'NET102', name: 'Mạng Máy tính Căn bản', credits: 3, grade: '8.0 (B+)' },
      ],
    },
    {
      term: 'Học kỳ 1 (Năm 2 - Hiện tại)',
      status: 'current',
      courses: [
        { code: 'CS303', name: 'Cơ sở Dữ liệu Nâng cao (SQL & NoSQL)', credits: 3, grade: 'Đang học' },
        { code: 'SE401', name: 'Kiến trúc & Công nghệ Phần mềm', credits: 3, grade: 'Đang học' },
      ],
    },
    {
      term: 'Học kỳ 2 (Năm 2)',
      status: 'upcoming',
      courses: [
        { code: 'AI201', name: 'Nhập môn Trí tuệ Nhân tạo & Machine Learning', credits: 3, grade: 'Chưa học' },
        { code: 'SE402', name: 'Kiểm thử & Đảm bảo Chất lượng Phần mềm', credits: 3, grade: 'Chưa học' },
      ],
    },
  ];

  return <div className="page-stack">
    <PageHeader
      eyebrow="KHUNG CHƯƠNG TRÌNH ĐÀO TẠO"
      title="Lộ trình học tập (Curriculum Roadmap)"
      subtitle="Chương trình Kỹ thuật Phần mềm chuẩn Carnegie Mellon University (CMU - 135 tín chỉ)."
    />

    <div className="curriculum-roadmap-container">
      {roadmapSemesters.map((sem, idx) => (
        <div key={idx} className={`curriculum-semester-card ${sem.status}`}>
          <div className="sem-header">
            <div>
              <span className="sem-tag">{sem.status === 'completed' ? 'Đã hoàn thành' : sem.status === 'current' ? 'Đang học kỳ này' : 'Dự kiến'}</span>
              <h4>{sem.term}</h4>
            </div>
            <span className="sem-credits">
              {sem.courses.reduce((sum, c) => sum + c.credits, 0)} Tín chỉ
            </span>
          </div>

          <div className="sem-courses-list">
            {sem.courses.map((c) => (
              <div key={c.code} className="sem-course-item">
                <div className="sem-course-info">
                  <code>{c.code}</code>
                  <strong>{c.name}</strong>
                </div>
                <div className="sem-course-meta">
                  <span>{c.credits} TC</span>
                  <span className={`grade-tag ${sem.status}`}>{c.grade}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

function StudentAssignmentsPage({ session }: { session: Session }) {
  const [assignments, setAssignments] = useState<Record<string, any>[]>([]);
  const [_loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/assignments');
      setAssignments(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function handleSendSubmission(event: FormEvent) {
    event.preventDefault();
    if (!submittingId || !submissionUrl) return;
    try {
      await api('/api/assignment-submissions', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: submittingId, fileUrl: submissionUrl }),
      }, session.csrfToken);
      setFeedbackMsg('Đã nộp bài tập thành công!');
      setSubmittingId(null);
      setSubmissionUrl('');
      await refresh();
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return <div className="page-stack">
    <PageHeader
      eyebrow="HỌC TẬP TRỰC TUYẾN"
      title="Bài tập & Đồ án học phần"
      subtitle="Theo dõi hạn nộp bài tập, nộp bài trực tuyến và xem phản hồi điểm từ giảng viên."
    />

    {feedbackMsg && <div className="success-alert"><CheckCircle2 size={16} /><span>{feedbackMsg}</span></div>}

    <div className="assignments-grid">
      {assignments.map((item) => {
        const isSubmitted = Boolean(item.submitted_at);
        const hasScore = item.score !== null && item.score !== undefined;
        return <div key={item.id} className="surface assignment-card">
          <div className="asg-card-top">
            <span className="course-badge">{item.course} · {item.section}</span>
            <span className={`status-pill ${hasScore ? 'status-active' : isSubmitted ? 'status-pending' : 'status-muted'}`}>
              {hasScore ? `Điểm: ${item.score}/10` : isSubmitted ? 'Đã nộp bài' : 'Chưa nộp'}
            </span>
          </div>

          <h3 className="asg-title">{item.title}</h3>
          <p className="asg-desc">{item.description}</p>

          <div className="asg-meta-row">
            <span className="due-date"><Clock size={14} /> Hạn nộp: {formatDateTime(item.due_at)}</span>
            {isSubmitted && <span className="submitted-date">Đã nộp: {formatDateTime(item.submitted_at)}</span>}
          </div>

          {item.feedback && <div className="feedback-box">
            <strong>Nhận xét của Giảng viên:</strong>
            <p>"{item.feedback}"</p>
          </div>}

          <div className="asg-actions">
            {hasScore ? (
              <span className="graded-stamp"><CheckCircle2 size={16} /> Đã chấm điểm</span>
            ) : (
              <button
                className="primary-button"
                onClick={() => { setSubmittingId(item.id); setSubmissionUrl(item.file_url || ''); }}
              >
                {isSubmitted ? 'Cập nhật lại bài nộp' : 'Nộp bài tập ngay'} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>;
      })}
    </div>

    {/* SUBMISSION MODAL */}
    {submittingId && <div className="password-overlay">
      <form className="edit-user-modal surface" onSubmit={handleSendSubmission}>
        <div className="modal-header">
          <div>
            <div className="section-kicker">NỘP BÀI TẬP TRỰC TUYẾN</div>
            <h3>Gửi bài làm của bạn</h3>
          </div>
          <button type="button" className="icon-button" onClick={() => setSubmittingId(null)}><X size={16} /></button>
        </div>

        <div className="form-grid">
          <label className="full-width">
            Liên kết bài nộp (Google Drive / GitHub / OneDrive / File storage URL)
            <input
              type="url"
              required
              placeholder="https://github.com/username/project hoặc https://drive.google.com/..."
              value={submissionUrl}
              onChange={(e) => setSubmissionUrl(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={() => setSubmittingId(null)}>Hủy</button>
          <button type="submit" className="primary-button"><Send size={15} /> Xác nhận nộp bài</button>
        </div>
      </form>
    </div>}
  </div>;
}

function StudentTuitionPage({ session, initialTab: _initialTab = 'summary' }: { session: Session; initialTab?: 'summary' | 'pay' }) {
  const [tuitions, setTuitions] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [payModalItem, setPayModalItem] = useState<Record<string, any> | null>(null);
  const [successPay, setSuccessPay] = useState('');

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/tuition');
      setTuitions(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function handleConfirmPayment(item: Record<string, any>) {
    try {
      await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ tuitionRecordId: item.id, amount: item.amount }),
      }, session.csrfToken);
      setSuccessPay(`Thanh toán thành công ${formatMoney(item.amount)} cho ${item.term}!`);
      setPayModalItem(null);
      await refresh();
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  const totalDebt = tuitions.filter((t) => t.status !== 'paid').reduce((acc, curr) => acc + (Number(curr.amount) - Number(curr.paid || 0)), 0);

  return <div className="page-stack">
    <PageHeader
      eyebrow="TÀI CHÍNH & HỌC PHÍ"
      title="Tra cứu & Thanh toán học phí trực tuyến"
      subtitle="Cổng thanh toán tự động VietQR kết nối hệ thống kế toán Đại học Duy Tân."
    />

    {/* FINANCIAL SUMMARY */}
    <div className="tuition-summary-banner">
      <div className="tuition-banner-copy">
        <span>Tổng nghĩa vụ học phí chưa thanh toán</span>
        <strong className="debt-amount">{formatMoney(totalDebt)}</strong>
        <small>Học phí đã bao gồm lệ phí thực hành, phòng Lab chuẩn CMU và tài liệu số.</small>
      </div>
      <div className="tuition-banner-actions">
        {tuitions.find((t) => t.status !== 'paid') ? (
          <button
            className="qr-pay-button"
            onClick={() => setPayModalItem(tuitions.find((t) => t.status !== 'paid')!)}
          >
            <QrCode size={18} />
            <span>Thanh toán VietQR ngay</span>
          </button>
        ) : (
          <span className="all-paid-badge"><CheckCircle2 size={18} /> Bạn đã hoàn thành toàn bộ học phí!</span>
        )}
      </div>
    </div>

    {successPay && <div className="success-alert"><CheckCircle2 size={16} /><span>{successPay}</span></div>}

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Lịch sử học phí theo từng học kỳ</h3>
          <span>Tra cứu chi tiết các khoản thu và trạng thái thanh toán</span>
        </div>
      </div>

      {loading ? <LoadingRows /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Học kỳ</th>
                <th>Số tiền phải nộp</th>
                <th>Đã thanh toán</th>
                <th>Còn lại</th>
                <th>Hạn thanh toán</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {tuitions.map((t) => {
                const remaining = Math.max(0, Number(t.amount) - Number(t.paid || 0));
                return <tr key={t.id}>
                  <td><strong>{t.term}</strong></td>
                  <td><strong>{formatMoney(t.amount)}</strong></td>
                  <td>{formatMoney(t.paid || 0)}</td>
                  <td><span className={remaining > 0 ? 'text-red font-bold' : ''}>{formatMoney(remaining)}</span></td>
                  <td>{formatDate(t.due_at)}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>
                    {t.status !== 'paid' ? (
                      <button className="small-primary" onClick={() => setPayModalItem(t)}>
                        <QrCode size={13} /> Nộp phí VietQR
                      </button>
                    ) : (
                      <span className="text-green text-xs font-semibold">✓ Đã tất toán</span>
                    )}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {/* VIETQR PAYMENT MODAL */}
    {payModalItem && <div className="password-overlay">
      <div className="vietqr-modal surface">
        <div className="modal-header">
          <div>
            <div className="section-kicker">CỔNG THANH TOÁN VIETQR CHÍNH THỨC</div>
            <h3>Thanh toán Học phí · {payModalItem.term}</h3>
          </div>
          <button className="icon-button" onClick={() => setPayModalItem(null)}><X size={16} /></button>
        </div>

        <div className="vietqr-body-grid">
          <div className="vietqr-box">
            <div className="qr-image-placeholder">
              {/* STYLIZED MOCKUP VIETQR */}
              <div className="qr-frame">
                <QrCode size={180} />
                <span className="qr-center-logo">DTU</span>
              </div>
              <small>Quét mã bằng App Ngân hàng bất kỳ</small>
            </div>
          </div>

          <div className="vietqr-info-list">
            <div className="qr-info-row">
              <label>Ngân hàng thụ hưởng</label>
              <strong>VietinBank (Ngân hàng TMCP Công Thương Việt Nam)</strong>
            </div>
            <div className="qr-info-row">
              <label>Số tài khoản</label>
              <strong className="text-red font-mono">118002938192</strong>
            </div>
            <div className="qr-info-row">
              <label>Tên chủ tài khoản</label>
              <strong>TRUONG DAI HOC DUY TAN</strong>
            </div>
            <div className="qr-info-row">
              <label>Số tiền thanh toán</label>
              <strong className="text-xl font-bold text-red">{formatMoney(payModalItem.amount)}</strong>
            </div>
            <div className="qr-info-row">
              <label>Nội dung chuyển khoản (Memo)</label>
              <code className="memo-code">DTU PAY {session.user.user_code}</code>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={() => setPayModalItem(null)}>Hủy bỏ</button>
          <button className="primary-button" onClick={() => void handleConfirmPayment(payModalItem)}>
            <Check size={16} /> Xác nhận chuyển khoản thành công (Demo)
          </button>
        </div>
      </div>
    </div>}
  </div>;
}

function StudentServicesPage({ session }: { session: Session }) {
  const [requests, setRequests] = useState<Record<string, any>[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/requests');
      setRequests(res.items || []);
    } finally {
      // Done
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          category: data.get('category'),
          subject: data.get('subject'),
          description: data.get('description'),
        }),
      }, session.csrfToken);
      setSuccess('Yêu cầu hỗ trợ đã được gửi thành công đến Bộ phận Một cửa!');
      setFormOpen(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return <div className="page-stack">
    <PageHeader
      eyebrow="DỊCH VỤ SINH VIÊN MỘT CỬA"
      title="Tiếp nhận & Xử lý yêu cầu hỗ trợ"
      subtitle="Gửi yêu cầu xin cấp giấy xác nhận, bảng điểm tạm, phúc khảo hoặc hỗ trợ tài chính trực tuyến."
    />

    {success && <div className="success-alert"><CheckCircle2 size={16} /><span>{success}</span></div>}
    {error && <InlineAlert message={error} />}

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Danh sách yêu cầu của tôi</h3>
          <span>Theo dõi quy trình xử lý minh bạch theo thời gian thực</span>
        </div>
        <button className="primary-button" onClick={() => setFormOpen(true)}>
          <Plus size={16} /> Tạo yêu cầu hỗ trợ mới
        </button>
      </div>

      {formOpen && <form className="create-user-form" onSubmit={handleSubmit}>
        <div className="form-title">
          <h3>Gửi phiếu hỗ trợ sinh viên</h3>
          <button type="button" className="icon-button" onClick={() => setFormOpen(false)}><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>
            Loại dịch vụ / yêu cầu
            <select name="category" required>
              <option value="Học vụ">Học vụ & Đào tạo (Cấp bảng điểm, chứng nhận)</option>
              <option value="Xác minh hồ sơ">Xác nhận sinh viên (Vay vốn, hoãn NVQS)</option>
              <option value="Tài chính">Tài chính & Học phí (Miễn giảm, gia hạn)</option>
              <option value="Khảo thí">Khảo thí & Phúc khảo bài thi</option>
              <option value="Khác">Hỗ trợ kỹ thuật & dịch vụ khác</option>
            </select>
          </label>
          <label>
            Tiêu đề yêu cầu
            <input name="subject" required placeholder="VD: Xin cấp bảng điểm tạm thời song ngữ..." />
          </label>
          <label className="full-width">
            Nội dung chi tiết & lý do
            <textarea name="description" rows={4} required placeholder="Mô tả cụ thể mục đích sử dụng, số lượng bản cần cấp..." />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Hủy</button>
          <button type="submit" className="primary-button"><Send size={15} /> Gửi yêu cầu</button>
        </div>
      </form>}

      {requests.length ? (
        <div className="requests-ticket-list">
          {requests.map((r) => (
            <article key={r.id} className="ticket-card">
              <div className="ticket-top">
                <span className="ticket-cat">{r.category}</span>
                <span className="ticket-date"><Clock size={12} /> {formatDateTime(r.created_at)}</span>
                <StatusBadge status={r.status} />
              </div>
              <h4 className="ticket-subject">{r.subject}</h4>
              <p className="ticket-desc">{r.description}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={LifeBuoy} title="Bạn chưa có yêu cầu hỗ trợ nào" description="Nhấp 'Tạo yêu cầu hỗ trợ mới' khi cần liên hệ phòng ban." />
      )}
    </section>
  </div>;
}

function StudentLibraryPage({ section, session: _session }: { section: string; session: Session }) {
  const [docs, setDocs] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>(`/api/portal/${section}`)
      .then((res) => setDocs(res.items || []))
      .finally(() => setLoading(false));
  }, [section]);

  return <div className="page-stack">
    <PageHeader
      eyebrow="TÀI NGUYÊN HỌC THUẬT"
      title={section === 'syllabus' ? 'Đề cương chi tiết học phần' : 'Thư viện học liệu số DTU'}
      subtitle="Tra cứu giáo trình, bài giảng, tài liệu tham khảo theo quy chuẩn đào tạo."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Tài liệu học tập các môn đang theo học</h3>
          <span>{docs.length} tài liệu học tập có sẵn</span>
        </div>
      </div>

      {loading ? <LoadingRows /> : docs.length ? (
        <div className="docs-card-grid">
          {docs.map((d) => (
            <div key={d.id} className="doc-card">
              <span className="doc-icon"><FileText size={22} /></span>
              <div className="doc-info">
                <span className="doc-type-tag">{d.document_type || 'Tài liệu'}</span>
                <strong>{d.title}</strong>
                <small>{d.course} · {d.section}</small>
              </div>
              <a href={d.file_url} target="_blank" rel="noreferrer" className="doc-download-btn">
                <Download size={15} /> Tải về / Xem
              </a>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookMarked} title="Chưa có tài liệu nào" description="Tài liệu sẽ được giảng viên tải lên trong kỳ học." />
      )}
    </section>
  </div>;
}

// -------------------------------------------------------------
// LECTURER MODULES
// -------------------------------------------------------------
function LecturerClassesPage({ session: _session }: { session: Session }) {
  const [classes, setClasses] = useState<Record<string, any>[]>([]);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/classes')
      .then((res) => setClasses(res.items || []))
      .finally(() => setLoading(false));
  }, []);

  return <div className="page-stack">
    <PageHeader
      eyebrow="QUẢN LÝ LỚP HỌC PHẦN"
      title="Danh sách lớp học phần được phân công"
      subtitle="Theo dõi tiến độ, sĩ số sinh viên và tài liệu giảng dạy trong học kỳ."
    />

    <div className="classes-grid">
      {classes.map((c) => (
        <div key={c.id} className="surface class-card">
          <div className="class-card-top">
            <span className="course-code-pill">{c.course_code}</span>
            <span className="term-badge">{c.term} · {c.academic_year}</span>
          </div>
          <h3>{c.course}</h3>
          <div className="class-section-id">Mã lớp: <strong>{c.code}</strong></div>

          <div className="class-meta-list">
            <div className="c-meta-item">
              <Building2 size={15} /> Phòng học: <strong>{c.room || 'Chưa xếp phòng'}</strong>
            </div>
            <div className="c-meta-item">
              <Users size={15} /> Sĩ số sinh viên: <strong>{c.student_count} sinh viên</strong>
            </div>
          </div>

          <div className="class-card-actions">
            <Link to="/lecturer/grades" className="primary-button small"><TableProperties size={14} /> Sổ điểm</Link>
            <Link to="/lecturer/attendance" className="secondary-button small"><ClipboardList size={14} /> Điểm danh</Link>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

// -------------------------------------------------------------
// COMMON FEED AND SETTINGS
// -------------------------------------------------------------
function NewsFeedPage({ role, session }: { role: PortalRole; session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNews, setActiveNews] = useState<Record<string, any> | null>(null);
  const [createModal, setCreateModal] = useState(false);

  const canCreate = (role === 'admin' && session.permissions.includes('admin.system.manage')) ||
                    (role === 'staff' && session.permissions.includes('staff.news.manage'));

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/news');
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function handleCreateNews(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await api('/api/news', {
        method: 'POST',
        body: JSON.stringify({
          title: data.get('title'),
          body: data.get('body'),
          audience: data.get('audience'),
        }),
      }, session.csrfToken);
      setCreateModal(false);
      await refresh();
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  async function handleDeleteNews(id: string) {
    if (!window.confirm('Xóa thông báo này?')) return;
    try {
      await api(`/api/news/${id}`, { method: 'DELETE' }, session.csrfToken);
      await refresh();
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return <div className="page-stack">
    <PageHeader
      eyebrow="TRUYỀN THÔNG & THÔNG BÁO"
      title="Bảng tin & Thông báo Đại học Duy Tân"
      subtitle="Kế hoạch đào tạo, lịch thi, học bổng và các sự kiện hoạt động của trường."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Bảng tin toàn trường</h3>
          <span>{items.length} tin tức & thông báo</span>
        </div>
        {canCreate && (
          <button className="primary-button" onClick={() => setCreateModal(true)}>
            <Plus size={16} /> Đăng thông báo mới
          </button>
        )}
      </div>

      {createModal && <form className="create-user-form" onSubmit={handleCreateNews}>
        <div className="form-title">
          <h3>Đăng thông báo mới</h3>
          <button type="button" className="icon-button" onClick={() => setCreateModal(false)}><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label className="full-width">
            Tiêu đề thông báo
            <input name="title" required placeholder="Nhập tiêu đề thông báo..." />
          </label>
          <label>
            Đối tượng nhận tin
            <select name="audience">
              <option value="all">Toàn trường (Tất cả)</option>
              <option value="student">Chỉ Sinh viên</option>
              <option value="lecturer">Chỉ Giảng viên</option>
              <option value="staff">Chỉ Cán bộ Nhân viên</option>
            </select>
          </label>
          <label className="full-width">
            Nội dung chi tiết
            <textarea name="body" rows={5} required placeholder="Nhập nội dung văn bản thông báo..." />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setCreateModal(false)}>Hủy</button>
          <button type="submit" className="primary-button"><Send size={15} /> Công bố thông báo</button>
        </div>
      </form>}

      {loading ? <LoadingRows /> : items.length ? (
        <div className="news-feed-list">
          {items.map((n) => (
            <article key={n.id} className="news-feed-card">
              <div className="news-feed-header">
                <span className="news-cat-pill">Thông báo chung</span>
                <span className="news-date"><Clock size={13} /> {formatDate(n.published_at)}</span>
                {canCreate && (
                  <button className="delete-icon-btn" title="Xóa thông báo" onClick={() => void handleDeleteNews(n.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <h3 onClick={() => setActiveNews(n)} className="news-feed-title">{n.title}</h3>
              <p className="news-feed-excerpt">{n.body}</p>
              <button className="text-button" onClick={() => setActiveNews(n)}>
                Đọc toàn văn <ArrowRight size={13} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Newspaper} title="Chưa có thông báo nào" description="" />
      )}
    </section>

    {activeNews && <div className="password-overlay">
      <section className="news-detail-modal surface">
        <div className="modal-header">
          <div>
            <div className="section-kicker">THÔNG BÁO CHÍNH THỨC</div>
            <h3>{activeNews.title}</h3>
            <small>Ngày công bố: {formatDateTime(activeNews.published_at)}</small>
          </div>
          <button className="icon-button" onClick={() => setActiveNews(null)}><X size={16} /></button>
        </div>
        <div className="news-modal-body">
          <p>{activeNews.body}</p>
        </div>
        <div className="modal-footer">
          <button className="primary-button" onClick={() => setActiveNews(null)}>Đóng</button>
        </div>
      </section>
    </div>}
  </div>;
}

function AccountSettingsPage({ role, session }: { role: PortalRole; session: Session }) {
  const [success, setSuccess] = useState('');
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<Record<string, any> | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api<Record<string, any>>('/api/cloud/status')
      .then(setCloudStatus)
      .catch(() => undefined);
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api<{ ok: boolean; totalSynced: number }>('/api/cloud/sync', { method: 'POST' }, session.csrfToken);
      setSuccess(`Đã đồng bộ thành công ${res.totalSynced} bản ghi lên Supabase Cloud PostgreSQL!`);
      const status = await api<Record<string, any>>('/api/cloud/status');
      setCloudStatus(status);
    } catch (err: any) {
      alert(`Đồng bộ thất bại: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  return <div className="page-stack">
    <PageHeader
      eyebrow="TÀI KHOẢN & BẢO MẬT"
      title="Cài đặt tài khoản"
      subtitle="Quản lý thông tin đăng nhập, bảo mật và tùy chọn hiển thị trên Cổng eDTU."
    />
    {success && <div className="success-alert"><CheckCircle2 size={16} /><span>{success}</span><button onClick={() => setSuccess('')}><X size={15} /></button></div>}

    <div className="settings-grid">
      <section className="surface p-card">
        <div className="section-heading">
          <div>
            <div className="section-kicker">THÔNG TIN XÁC THỰC</div>
            <h3>Tài khoản đang đăng nhập</h3>
          </div>
          <span className="status-pill status-active">Hoạt động</span>
        </div>

        <div className="detail-meta-grid">
          <div className="meta-item">
            <label>Mã tài khoản</label>
            <strong>{session.user.user_code}</strong>
          </div>
          <div className="meta-item">
            <label>Họ và tên</label>
            <strong>{session.user.full_name}</strong>
          </div>
          <div className="meta-item">
            <label>Email liên hệ</label>
            <strong>{session.user.email}</strong>
          </div>
          <div className="meta-item">
            <label>Vai trò đang hoạt động</label>
            <strong>{roleInfo[role].label}</strong>
          </div>
        </div>

        <div className="settings-action-row">
          <button className="primary-button" onClick={() => setChangePassOpen(true)}>
            <LockKeyhole size={15} /> Đổi mật khẩu tài khoản
          </button>
        </div>
      </section>

      {/* CLOUD DATABASE STATUS CARD */}
      <section className="surface p-card">
        <div className="section-heading">
          <div>
            <div className="section-kicker">CƠ SỞ DỮ LIỆU ĐÁM MÂY</div>
            <h3>Supabase Cloud PostgreSQL</h3>
          </div>
          <span className="status-pill status-active">
            <Database size={13} /> {cloudStatus?.connected ? 'Đang kết nối · Live' : 'Đang kiểm tra...'}
          </span>
        </div>
        <div className="detail-meta-grid">
          <div className="meta-item">
            <label>Nền tảng</label>
            <strong>{cloudStatus?.provider || 'Supabase PostgreSQL 17'}</strong>
          </div>
          <div className="meta-item">
            <label>Máy chủ Cloud</label>
            <code>{cloudStatus?.host || 'db.zpenkfrgrosreaketgzr.supabase.co'}</code>
          </div>
          <div className="meta-item">
            <label>Khu vực máy chủ</label>
            <strong>Singapore (ap-southeast-1)</strong>
          </div>
          <div className="meta-item">
            <label>Độ trễ kết nối</label>
            <strong className="text-green font-bold">{cloudStatus?.pingMs ? `${cloudStatus.pingMs} ms` : 'Tối ưu'}</strong>
          </div>
        </div>
        <div className="settings-action-row">
          <button className="primary-button" onClick={() => void handleSync()} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Đang đồng bộ...' : 'Đồng bộ hai chiều với Cloud'}
          </button>
        </div>
      </section>

      <section className="surface p-card">
        <div className="section-heading">
          <div>
            <div className="section-kicker">THÔNG TIN HỆ THỐNG</div>
            <h3>Phiên bản phần mềm eDTU</h3>
          </div>
        </div>
        <div className="detail-meta-grid">
          <div className="meta-item">
            <label>Phiên bản</label>
            <strong>eDTU Portal v2.0 Enterprise Release</strong>
          </div>
          <div className="meta-item">
            <label>Niên khóa</label>
            <strong>2026–2027 (Học kỳ 1)</strong>
          </div>
          <div className="meta-item">
            <label>Cơ sở chính</label>
            <strong>254 Nguyễn Văn Linh, Đà Nẵng</strong>
          </div>
          <div className="meta-item">
            <label>Kiểm định quốc tế</label>
            <strong>ABET (Mỹ) & THE Rankings Top 500</strong>
          </div>
        </div>
      </section>
    </div>

    {changePassOpen && <PasswordChange
      session={session}
      onChanged={() => {
        setChangePassOpen(false);
        setSuccess('Đổi mật khẩu thành công!');
      }}
    />}
  </div>;
}

// -------------------------------------------------------------
// STAFF & ADMIN ADDITIONAL PAGES
// -------------------------------------------------------------
function StaffOperationsPage({ session: _session }: { session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/operations')
      .then((res) => setItems(res.items || []))
      .catch(() => undefined);
  }, []);

  return <div className="page-stack">
    <PageHeader
      eyebrow="NGHIỆP VỤ ĐÀO TẠO"
      title="Trung tâm điều hành nghiệp vụ học vụ"
      subtitle="Theo dõi và tiếp nhận hồ sơ xét tốt nghiệp, bảng điểm và đối soát đào tạo."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Hồ sơ nghiệp vụ đang xử lý</h3>
          <span>{items.length} hồ sơ liên quan</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sinh viên</th>
              <th>Mã SV</th>
              <th>Loại nghiệp vụ</th>
              <th>Tiêu đề hồ sơ</th>
              <th>Ngày tiếp nhận</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.student}</strong></td>
                <td><code>{item.user_code || 'SV-DTU'}</code></td>
                <td><span className="ticket-cat">{item.category}</span></td>
                <td>{item.subject}</td>
                <td>{formatDateTime(item.created_at)}</td>
                <td><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

function StaffReportsPage({ session: _session }: { session: Session }) {
  const [reports, setReports] = useState<Record<string, any>[]>([]);
  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/reports')
      .then((res) => setReports(res.items || []))
      .catch(() => undefined);
  }, []);

  return <div className="page-stack">
    <PageHeader
      eyebrow="BÁO CÁO & THỐNG KÊ"
      title="Báo cáo thống kê đào tạo & học phí các khoa"
      subtitle="Tổng hợp số lượng sinh viên, tiến độ hoàn thành nghĩa vụ học phí theo từng đơn vị."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Số liệu theo Khoa đào tạo</h3>
          <span>Học kỳ 1 năm học 2026–2027</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Khoa đào tạo</th>
              <th>Tổng sinh viên</th>
              <th>Đã hoàn tất học phí</th>
              <th>Chưa hoàn tất học phí</th>
              <th>Tỷ lệ hoàn thành</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, idx) => {
              const total = Number(r.paid_tuition) + Number(r.unpaid_tuition);
              const rate = total > 0 ? Math.round((Number(r.paid_tuition) / total) * 100) : 100;
              return <tr key={idx}>
                <td><strong>{r.faculty}</strong></td>
                <td>{r.total_students || 0} SV</td>
                <td><span className="text-green font-bold">{r.paid_tuition} SV</span></td>
                <td><span className="text-red font-bold">{r.unpaid_tuition} SV</span></td>
                <td>
                  <span className="rate-badge">{rate}%</span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

function AdminFinancePage({ session: _session }: { session: Session }) {
  const [tuitions, setTuitions] = useState<Record<string, any>[]>([]);
  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/tuition')
      .then((res) => setTuitions(res.items || []))
      .catch(() => undefined);
  }, []);

  const totalBilled = tuitions.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalCollected = tuitions.reduce((acc, curr) => acc + (Number(curr.paid) || 0), 0);

  return <div className="page-stack">
    <PageHeader
      eyebrow="QUẢN TRỊ TÀI CHÍNH"
      title="Tổng quan học phí & giao dịch thanh toán"
      subtitle="Giám sát đối soát thanh toán trực tuyến qua cổng ngân hàng VietinBank & VietQR."
    />

    <div className="stat-grid">
      <div className="stat-card stat-blue">
        <div className="stat-top"><span>Tổng học phí phát hành</span><WalletCards size={18} /></div>
        <strong className="stat-value">{formatMoney(totalBilled)}</strong>
        <div className="stat-caption">Toàn khóa 2026–2027</div>
      </div>
      <div className="stat-card stat-green">
        <div className="stat-top"><span>Đã thu thực tế</span><CheckCircle2 size={18} /></div>
        <strong className="stat-value">{formatMoney(totalCollected)}</strong>
        <div className="stat-caption">Khớp lệnh tự động</div>
      </div>
      <div className="stat-card stat-amber">
        <div className="stat-top"><span>Chưa thu</span><Clock size={18} /></div>
        <strong className="stat-value">{formatMoney(Math.max(0, totalBilled - totalCollected))}</strong>
        <div className="stat-caption">Đang trong thời hạn nộp</div>
      </div>
    </div>

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Sổ cái học phí sinh viên</h3>
          <span>{tuitions.length} bản ghi học phí</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sinh viên</th>
              <th>Mã SV</th>
              <th>Học kỳ</th>
              <th>Phải nộp</th>
              <th>Đã nộp</th>
              <th>Hạn thanh toán</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {tuitions.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.full_name}</strong></td>
                <td><code>{t.user_code}</code></td>
                <td>{t.term}</td>
                <td><strong>{formatMoney(t.amount)}</strong></td>
                <td>{formatMoney(t.paid || 0)}</td>
                <td>{formatDate(t.due_at)}</td>
                <td><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

function AdminAuditPage({ session: _session }: { session: Session }) {
  const [logs, setLogs] = useState<Record<string, any>[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/portal/audit')
      .then((res) => setLogs(res.items || []))
      .catch(() => undefined);
  }, []);

  const filtered = logs.filter((l) => !search || JSON.stringify(l).toLowerCase().includes(search.toLowerCase()));

  return <div className="page-stack">
    <PageHeader
      eyebrow="BẢO MẬT HỆ THỐNG"
      title="Nhật ký kiểm toán an toàn (Audit Logs)"
      subtitle="Theo dõi toàn bộ thao tác đăng nhập, sửa điểm, cấp quyền và giao dịch trong hệ thống."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Lịch sử kiểm toán thời gian thực</h3>
          <span>{filtered.length} sự kiện được ghi nhận</span>
        </div>
        <div className="inline-search">
          <Search size={15} />
          <input placeholder="Tìm hành động, người dùng..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Vai trò</th>
              <th>Hành động (Action)</th>
              <th>Loại tài nguyên</th>
              <th>Địa chỉ IP</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td>{formatDateTime(l.created_at)}</td>
                <td><strong>{l.actor || 'Hệ thống'}</strong></td>
                <td><span className={`role-tag role-tag-${l.active_role}`}>{l.active_role}</span></td>
                <td><code>{l.action}</code></td>
                <td>{l.resource_type}</td>
                <td><small>{l.ip_address || '127.0.0.1'}</small></td>
                <td><small className="font-mono text-muted">{l.details_json ? l.details_json.slice(0, 40) + '...' : '—'}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

// -------------------------------------------------------------
// EXISTING CORE DATA PAGES (ENHANCED)
// -------------------------------------------------------------
function DataPage({ role, section, title, session }: { role: PortalRole; section: string; title: string; session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const endpoint = useMemo(() => {
    if (role === 'admin' && ['students', 'lecturers', 'staff'].includes(section)) return `/api/users?role=${section === 'students' ? 'student' : section === 'lecturers' ? 'lecturer' : 'staff'}`;
    if (role === 'admin' && section === 'audit') return '/api/portal/audit';
    if (role === 'admin' && section === 'units') return '/api/portal/units';
    if (role === 'admin' && section === 'grades') return '/api/grade-approvals';
    if (role === 'admin' && section === 'education') return '/api/portal/courses';
    if (role === 'admin' && section === 'courses') return '/api/portal/courses';
    if (role === 'admin' && section === 'schedule') return '/api/portal/schedule';
    if (role === 'admin' && section === 'finance') return '/api/portal/tuition';
    if (role === 'admin' && section === 'news') return '/api/portal/news';
    if (role === 'admin' && section === 'settings') return '/api/portal/settings';
    if (role === 'lecturer' && section === 'schedule') return '/api/portal/classes';
    if (role === 'student' && section === 'curriculum') return '/api/portal/courses';
    return `/api/portal/${section}`;
  }, [role, section]);

  useEffect(() => {
    setLoading(true); setError('');
    api<{ items?: Record<string, any>[] }>(endpoint).then((result) => setItems(result.items || (Array.isArray(result) ? result : []))).catch((reason) => {
      setItems([]);
      if ((reason as Error & { status?: number }).status !== 403 && (reason as Error & { status?: number }).status !== 404) setError((reason as Error).message);
    }).finally(() => setLoading(false));
  }, [endpoint]);

  const description = pageDescription[section] || 'Dữ liệu sẽ hiển thị theo quyền truy cập và phạm vi được cấp.';
  const filtered = items.filter((item) => !search || Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase())));

  return <div className="page-stack">
    <PageHeader title={title} subtitle={description} eyebrow={roleInfo[role].label.toUpperCase()} />
    {error && <InlineAlert message={error} />}
    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>{title}</h3>
          <span>{loading ? 'Đang tải…' : `${filtered.length} bản ghi`}</span>
        </div>
        <div className="toolbar-actions">
          <div className="inline-search">
            <Search size={15} />
            <input aria-label="Tìm kiếm trong bảng" placeholder="Tìm kiếm" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
      </div>
      {loading ? <LoadingRows /> : filtered.length ? <RecordTable items={filtered} role={role} section={section} session={session} /> : <EmptyState icon={iconForSection(section)} title={search ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu'} description="" />}
    </section>
  </div>;
}

const pageDescription: Record<string, string> = {
  profile: 'Hồ sơ và thông tin tài khoản được quản lý theo quy định của nhà trường.',
  news: 'Thông tin và thông báo được công bố theo nhóm người nhận.',
  schedule: 'Thời khóa biểu chỉ hiển thị lớp học phần bạn đã đăng ký hoặc được phân công.',
  enrollment: 'Tra cứu và đăng ký học phần trong thời gian nhà trường mở đợt đăng ký.',
  grades: 'Điểm cá nhân chỉ hiển thị sau khi được phê duyệt.',
  curriculum: 'Theo dõi chương trình đào tạo và tiến độ học tập.',
  assignments: 'Bài tập, hạn nộp và phản hồi trong các lớp học phần của bạn.',
  syllabus: 'Đề cương học phần và tài liệu giảng dạy.',
  tuition: 'Tra cứu khoản thu và nghĩa vụ học phí.',
  payments: 'Thanh toán theo hướng dẫn của nhà trường.',
  transactions: 'Lịch sử giao dịch và trạng thái đối soát.',
  library: 'Tra cứu tài nguyên học thuật được cấp quyền.',
  services: 'Gửi yêu cầu hỗ trợ và theo dõi tiến độ xử lý.',
  classes: 'Danh sách lớp học phần được phân công giảng dạy.',
  students: 'Sinh viên thuộc các lớp được phân công hoặc phạm vi được cấp.',
  materials: 'Tài liệu phân theo môn học và học kỳ.',
  attendance: 'Theo dõi điểm danh tại các lớp được phân công.',
  tasks: 'Các công việc được giao trực tiếp cho bạn.',
  requests: 'Yêu cầu được phân công hoặc thuộc phạm vi phòng ban của bạn.',
  operations: 'Các nghiệp vụ hiển thị theo quyền được cấp cho tài khoản.',
  reports: 'Báo cáo trong phạm vi đơn vị và chức năng được cấp.',
  audit: 'Nhật ký ghi nhận các thao tác quản trị quan trọng.',
  education: 'Quản lý chương trình và nghiệp vụ đào tạo.',
  courses: 'Danh mục học phần của nhà trường.',
  finance: 'Khoản thu và đối soát thanh toán.',
  settings: 'Cấu hình hệ thống dành cho người có thẩm quyền.',
};

function PageHeader({ title, subtitle, eyebrow }: { title: string; subtitle: string; eyebrow: string }) {
  return <div className="page-heading">
    <div>
      <div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  </div>;
}

function RecordTable({ items, role, section, session }: { items: Record<string, any>[]; role: PortalRole; section: string; session: Session }) {
  const excluded = new Set(['details_json', 'description', 'body', 'file_url', 'ip_address', 'actor_user_id', 'id', 'parent_id']);
  const columns = Object.keys(items[0]).filter((key) => !excluded.has(key)).slice(0, 7);
  return <div className="table-wrap">
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((key) => <th key={key}>{columnName(key)}</th>)}
          {role === 'staff' && section === 'requests' && <th>Thao tác</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => <tr key={item.id || item.user_code || index}>
          {columns.map((key) => <td key={key}>{cellValue(key, item[key])}</td>)}
          {role === 'staff' && section === 'requests' && <td><RequestAction item={item} session={session} /></td>}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function RequestAction({ item, session }: { item: Record<string, any>; session: Session }) {
  const [busy, setBusy] = useState(false);
  async function change(status: string) {
    setBusy(true);
    try {
      await api(`/api/requests/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, session.csrfToken);
      window.location.reload();
    } catch (error) {
      window.alert((error as Error).message);
      setBusy(false);
    }
  }
  return <select disabled={busy} value={item.status} onChange={(event) => void change(event.target.value)} aria-label="Cập nhật trạng thái yêu cầu">
    <option value="new">Mới tiếp nhận</option>
    <option value="in_progress">Đang xử lý</option>
    <option value="waiting">Chờ bổ sung</option>
    <option value="completed">Đã hoàn thành</option>
    <option value="rejected">Từ chối</option>
  </select>;
}

// -------------------------------------------------------------
// ADMIN USERS PAGE
// -------------------------------------------------------------
function UsersPage({ session }: { session: Session }) {
  const [users, setUsers] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [scopedUser, setScopedUser] = useState<Record<string, any> | null>(null);
  const [editingUser, setEditingUser] = useState<Record<string, any> | null>(null);
  const [flash, setFlash] = useState('');
  const [credentials, setCredentials] = useState<Array<{ userCode: string; role: string; password: string }>>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Record<string, any>[] }>(`/api/users?search=${encodeURIComponent(search)}`);
      setUsers(result.items);
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [search]);

  const shown = users.filter((user) => filter === 'all' || String(user.roles || '').split(',').includes(filter));
  const counts = { all: users.length, student: 0, lecturer: 0, staff: 0, admin: 0 } as Record<string, number>;
  users.forEach((user) => String(user.roles || '').split(',').filter(Boolean).forEach((role) => { if (role in counts) counts[role] += 1; }));

  async function updateStatus(user: Record<string, any>, status: string) {
    try {
      await api(`/api/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, session.csrfToken);
      setFlash(`Đã cập nhật trạng thái tài khoản ${user.user_code}.`);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function resetPassword(user: Record<string, any>) {
    try {
      const result = await api<{ temporaryPassword: string }>(`/api/users/${user.id}/reset-password`, { method: 'POST' }, session.csrfToken);
      setCredentials([{ userCode: user.user_code, role: String(user.roles || ''), password: result.temporaryPassword }]);
      setFlash('Mật khẩu tạm đã được tạo.');
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function setPrimaryRole(user: Record<string, any>, role: PortalRole) {
    try {
      await api(`/api/users/${user.id}/primary-role`, { method: 'PUT', body: JSON.stringify({ role }) }, session.csrfToken);
      setFlash(`Vai trò mặc định của ${user.user_code} là ${roleInfo[role].label}.`);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function editUser(user: Record<string, any>) {
    try {
      const result = await api<{ user: Record<string, any>; roles: RoleAssignment[] }>(`/api/users/${user.id}`);
      setEditingUser({ ...result.user, roles: result.roles.map((role) => role.name) });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return <div className="page-stack">
    <PageHeader title="Quản trị người dùng & phân quyền" subtitle="Cấp tài khoản, thiết lập vai trò và quản lý phạm vi dữ liệu toàn trường." eyebrow="QUẢN TRỊ TÀI KHOẢN" />
    {flash && <div className="success-alert"><CheckCircle2 size={17} /><span>{flash}</span><button onClick={() => setFlash('')}><X size={15} /></button></div>}
    {error && <InlineAlert message={error} />}

    {credentials.length > 0 && <section className="surface credential-card">
      <div>
        <div className="section-kicker">MẬT KHẨU TẠM THỜI</div>
        <h3>Cấp mật khẩu thành công</h3>
      </div>
      <div className="credential-list">
        {credentials.map((item) => <div key={item.userCode}>
          <strong>{item.userCode}</strong>
          <code>{item.password}</code>
          <span>{roleLabel(item.role)}</span>
        </div>)}
      </div>
      <button className="text-button" onClick={() => setCredentials([])}>Đã lưu an toàn <Check size={14} /></button>
    </section>}

    <div className="surface users-surface">
      <div className="users-toolbar">
        <div>
          <h3>Danh sách tài khoản hệ thống</h3>
          <span>{users.length} tài khoản trong cơ sở dữ liệu</span>
        </div>
        <div className="toolbar-actions">
          <button className="primary-button" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={16} /> Tạo tài khoản mới
          </button>
        </div>
      </div>

      {showCreate && <CreateUserForm session={session} onCreated={(item) => { setCredentials([item]); setFlash('Tài khoản đã tạo thành công.'); setShowCreate(false); void refresh(); }} onCancel={() => setShowCreate(false)} />}
      {scopedUser && <DataScopePanel user={scopedUser} session={session} onClose={() => setScopedUser(null)} />}
      {editingUser && <EditUserForm user={editingUser} session={session} onClose={() => setEditingUser(null)} onSaved={() => { setEditingUser(null); setFlash('Đã cập nhật hồ sơ tài khoản.'); void refresh(); }} />}

      <div className="user-filters">
        <div className="tab-list">
          {[
            ['all', 'Tất cả'], ['student', 'Sinh viên'], ['lecturer', 'Giảng viên'], ['staff', 'Nhân viên'], ['admin', 'Quản trị viên'],
          ].map(([key, label]) => <button key={key} className={`filter-tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            {label}
            <span>{counts[key]}</span>
          </button>)}
        </div>
        <div className="inline-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, họ tên, email..." />
        </div>
      </div>

      {loading ? <LoadingRows /> : shown.length ? <div className="table-wrap">
        <table className="data-table user-table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Email</th>
              <th>Đơn vị</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((user) => {
              const assignedRoles = String(user.roles || '').split(',').filter(Boolean) as PortalRole[];
              return <tr key={user.id}>
                <td>
                  <div className="user-cell">
                    <span className="avatar mini">{String(user.full_name || '?').slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{user.full_name}</strong>
                      <small>{user.user_code}</small>
                    </span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>{user.organization || '—'}</td>
                <td>
                  <div className="role-tags">
                    {assignedRoles.map((role) => <span className={`role-tag role-tag-${role}`} key={role}>{roleLabel(role)}</span>)}
                  </div>
                  {assignedRoles.length > 1 && <>
                    <small className="primary-role-hint">Mặc định đăng nhập:</small>
                    <select className="small-select primary-role-select" value={user.primary_role || assignedRoles[0]} onChange={(e) => void setPrimaryRole(user, e.target.value as PortalRole)}>
                      {assignedRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                  </>}
                </td>
                <td><StatusBadge status={user.status} /></td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  <div className="row-actions">
                    <button className="table-action" onClick={() => void editUser(user)} title="Chỉnh sửa hồ sơ"><FileText size={14} /></button>
                    <button className="table-action" onClick={() => setScopedUser(user)} title="Phạm vi dữ liệu"><ShieldCheck size={15} /></button>
                    <button className="table-action" onClick={() => void resetPassword(user)} title="Đặt lại mật khẩu"><LockKeyhole size={15} /></button>
                    {user.status !== 'active' ? (
                      <button className="table-action activate" onClick={() => void updateStatus(user, 'active')} title="Kích hoạt"><Check size={15} /></button>
                    ) : (
                      <button className="table-action" onClick={() => void updateStatus(user, 'locked')} title="Khóa tài khoản"><X size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <EmptyState icon={Users} title="Không tìm thấy tài khoản" description="" />}
    </div>
  </div>;
}

// -------------------------------------------------------------
// EDIT USER MODAL
// -------------------------------------------------------------
function EditUserForm({ user, session, onClose, onSaved }: { user: Record<string, any>; session: Session; onClose: () => void; onSaved: () => void }) {
  const roles = user.roles as PortalRole[];
  const [units, setUnits] = useState<Record<string, any>[]>([]);
  const [values, setValues] = useState({
    fullName: user.full_name || '',
    email: user.email || '',
    facultyUnitId: user.faculty_unit_id || '',
    departmentUnitId: user.department_unit_id || user.staff_department_unit_id || '',
    unitId: user.unit_id || '',
    major: user.major || '',
    cohort: user.cohort || '',
    enrollmentYear: user.enrollment_year || '',
    academicDegree: user.academic_degree || '',
    title: user.academic_title || '',
    workPhone: user.lecturer_phone || user.staff_phone || '',
    positionName: user.position_name || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/units').then((result) => setUnits(result.items)).catch(() => undefined);
  }, []);

  const field = (key: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(values) }, session.csrfToken);
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="password-overlay">
    <form className="edit-user-modal surface" onSubmit={submit}>
      <div className="modal-header">
        <div>
          <div className="section-kicker">CHỈNH SỬA HỒ SƠ TÀI KHOẢN</div>
          <h3>{user.full_name} ({user.user_code})</h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="form-grid">
        <label>Họ và tên<input value={values.fullName} onChange={(e) => field('fullName', e.target.value)} required /></label>
        <label>Email<input type="email" value={values.email} onChange={(e) => field('email', e.target.value)} required /></label>
        {(roles.includes('student') || roles.includes('lecturer')) && <label>Khoa<select value={values.facultyUnitId} onChange={(e) => field('facultyUnitId', e.target.value)}><option value="">Chưa gán</option>{units.filter((unit) => unit.unit_type === 'faculty').map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>}
        {(roles.includes('student') || roles.includes('lecturer') || roles.includes('staff')) && <label>Bộ môn / Phòng ban<select value={values.departmentUnitId} onChange={(e) => field('departmentUnitId', e.target.value)}><option value="">Chưa gán</option>{units.filter((unit) => unit.unit_type === 'department').map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>}
        {roles.includes('student') && <>
          <label>Ngành học<input value={values.major} onChange={(e) => field('major', e.target.value)} /></label>
          <label>Khóa<input value={values.cohort} onChange={(e) => field('cohort', e.target.value)} /></label>
          <label>Năm nhập học<input type="number" value={values.enrollmentYear} onChange={(e) => field('enrollmentYear', e.target.value)} /></label>
        </>}
        {roles.includes('lecturer') && <>
          <label>Học vị<input value={values.academicDegree} onChange={(e) => field('academicDegree', e.target.value)} /></label>
          <label>Chức danh<input value={values.title} onChange={(e) => field('title', e.target.value)} /></label>
        </>}
        {roles.includes('staff') && <>
          <label>Đơn vị công tác<select value={values.unitId} onChange={(e) => field('unitId', e.target.value)}><option value="">Chưa gán</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>
          <label>Vị trí công việc<input value={values.positionName} onChange={(e) => field('positionName', e.target.value)} /></label>
        </>}
        {(roles.includes('lecturer') || roles.includes('staff')) && <label>Điện thoại<input value={values.workPhone} onChange={(e) => field('workPhone', e.target.value)} /></label>}
      </div>

      {error && <InlineAlert message={error} />}

      <div className="modal-footer">
        <button type="button" className="secondary-button" onClick={onClose}>Hủy</button>
        <button className="primary-button" disabled={busy}>{busy ? 'Đang lưu…' : <><Check size={15} /> Lưu thay đổi</>}</button>
      </div>
    </form>
  </div>;
}

function DataScopePanel({ user, session, onClose }: { user: Record<string, any>; session: Session; onClose: () => void }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [units, setUnits] = useState<Record<string, any>[]>([]);
  const [role, setRole] = useState<PortalRole>((String(user.roles || 'student').split(',')[0] as PortalRole) || 'student');
  const [resource, setResource] = useState('students');
  const [scopeType, setScopeType] = useState('unit');
  const [scopeId, setScopeId] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const result = await api<{ items: Record<string, any>[] }>(`/api/data-scopes/${user.id}`);
      setItems(result.items);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    api<{ items: Record<string, any>[] }>('/api/units').then((result) => setUnits(result.items)).catch(() => undefined);
  }, [user.id]);

  async function grant(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await api('/api/data-scopes', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, role, resource, scopeType, scopeId: ['unit', 'department'].includes(scopeType) ? scopeId : undefined }),
      }, session.csrfToken);
      setScopeId('');
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/data-scopes/${id}`, { method: 'DELETE' }, session.csrfToken);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  const userRoles = String(user.roles || '').split(',').filter(Boolean) as PortalRole[];

  return <section className="scope-panel surface">
    <div className="form-title">
      <div>
        <div className="section-kicker">PHẠM VI TRUY CẬP DỮ LIỆU</div>
        <h3>Phân quyền dữ liệu cho {user.full_name}</h3>
      </div>
      <button className="icon-button" onClick={onClose}><X size={16} /></button>
    </div>
    {error && <InlineAlert message={error} />}
    <form className="scope-form" onSubmit={grant}>
      <label>Vai trò<select value={role} onChange={(e) => setRole(e.target.value as PortalRole)}>{userRoles.map((item) => <option key={item} value={item}>{roleInfo[item].label}</option>)}</select></label>
      <label>Loại dữ liệu<select value={resource} onChange={(e) => setResource(e.target.value)}><option value="students">Hồ sơ sinh viên</option><option value="requests">Yêu cầu hỗ trợ</option></select></label>
      <label>Phạm vi<select value={scopeType} onChange={(e) => setScopeType(e.target.value)}><option value="unit">Theo Khoa</option><option value="department">Theo Bộ môn</option><option value="all">Toàn trường</option></select></label>
      {scopeType !== 'all' && <label>Đơn vị<select value={scopeId} onChange={(e) => setScopeId(e.target.value)} required><option value="">Chọn đơn vị</option>{units.filter((unit) => unit.unit_type === (scopeType === 'department' ? 'department' : 'faculty')).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
      <button className="primary-button"><Plus size={15} /> Cấp quyền</button>
    </form>
    <div className="scope-list">
      {items.length ? items.map((item) => <div className="scope-row" key={item.id}>
        <span className="scope-tag">{item.role}</span>
        <strong>{item.resource}</strong>
        <span>{item.scope_type === 'all' ? 'Toàn quyền' : units.find((u) => u.id === item.scope_id)?.name || item.scope_id}</span>
        <button className="table-action" onClick={() => void revoke(item.id)}><X size={14} /></button>
      </div>) : <div className="scope-empty">Chưa gán phạm vi riêng.</div>}
    </div>
  </section>;
}

function CreateUserForm({ session, onCreated, onCancel }: { session: Session; onCreated: (item: { userCode: string; role: string; password: string }) => void; onCancel: () => void }) {
  const [values, setValues] = useState({
    userCode: '', fullName: '', email: '', role: 'student' as PortalRole, facultyUnitId: '', departmentUnitId: '', unitId: '', major: '', cohort: '', enrollmentYear: '', academicDegree: '', title: '', workPhone: '', positionName: '',
  });
  const [units, setUnits] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: Record<string, any>[] }>('/api/units').then((result) => setUnits(result.items)).catch(() => undefined);
  }, []);

  const field = (key: keyof typeof values, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ temporaryPassword: string }>('/api/users', { method: 'POST', body: JSON.stringify(values) }, session.csrfToken);
      onCreated({ userCode: values.userCode, role: values.role, password: result.temporaryPassword });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="create-user-form surface" onSubmit={submit}>
    <div className="form-title">
      <div>
        <div className="section-kicker">CẤP TÀI KHOẢN MỚI</div>
        <h3>Thông tin người dùng mới</h3>
      </div>
      <button type="button" className="icon-button" onClick={onCancel}><X size={17} /></button>
    </div>
    <div className="form-grid">
      <label>Mã tài khoản (User Code)<input value={values.userCode} onChange={(e) => field('userCode', e.target.value)} required placeholder="VD: sv.k28, gv.nguyenvana" /></label>
      <label>Họ và tên<input value={values.fullName} onChange={(e) => field('fullName', e.target.value)} required /></label>
      <label>Email liên hệ<input type="email" value={values.email} onChange={(e) => field('email', e.target.value)} required /></label>
      <label>Vai trò hệ thống<select value={values.role} onChange={(e) => field('role', e.target.value as PortalRole)}>{roleOptions.map((role) => <option value={role.id} key={role.id}>{role.label}</option>)}</select></label>
      {['student', 'lecturer'].includes(values.role) && <label>Khoa<select value={values.facultyUnitId} onChange={(e) => field('facultyUnitId', e.target.value)}><option value="">Chọn khoa</option>{units.filter((u) => u.unit_type === 'faculty').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      {values.role === 'student' && <>
        <label>Ngành học<input value={values.major} onChange={(e) => field('major', e.target.value)} placeholder="Kỹ thuật Phần mềm CMU" /></label>
        <label>Khóa sinh viên<input value={values.cohort} onChange={(e) => field('cohort', e.target.value)} placeholder="K28" /></label>
      </>}
    </div>
    {error && <InlineAlert message={error} />}
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>Hủy</button>
      <button className="primary-button" disabled={busy}>{busy ? 'Đang tạo…' : <><Plus size={16} /> Tạo tài khoản</>}</button>
    </div>
  </form>;
}

// -------------------------------------------------------------
// ADMIN PERMISSIONS, UNITS, ACADEMIC, APPROVALS
// -------------------------------------------------------------
function PermissionsPage({ session }: { session: Session }) {
  const [items, setItems] = useState<Array<{ role: PortalRole; permission: string; description: string; granted: number }>>([]);
  const [activeRole, setActiveRole] = useState<PortalRole>('student');
  const [selected, setSelected] = useState<string[]>([]);
  const [_baseline, setBaseline] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ items: typeof items }>('/api/roles/permissions').then((result) => setItems(result.items)).catch((reason) => setError((reason as Error).message));
  }, []);

  useEffect(() => {
    const ids = items.filter((item) => item.role === activeRole && item.granted).map((item) => item.permission);
    setSelected(ids); setBaseline(ids);
  }, [items, activeRole]);

  const groups = groupPermissions(items.filter((item) => item.role === activeRole));

  async function save() {
    setError('');
    try {
      await api(`/api/roles/${activeRole}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds: selected }) }, session.csrfToken);
      setBaseline(selected); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function toggle(permission: string) {
    setSelected((prev) => prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]);
  }

  return <div className="page-stack">
    <PageHeader title="Phân quyền vai trò hệ thống (RBAC)" subtitle="Cấu hình ma trận quyền chức năng theo 4 vai trò chính của cổng thông tin." eyebrow="BẢO MẬT HỆ THỐNG" />
    {error && <InlineAlert message={error} />}
    <div className="permission-layout">
      <section className="surface role-list-panel">
        <div className="section-kicker">CHỌN VAI TRÒ</div>
        {roleOptions.map((role) => <button key={role.id} className={`permission-role ${activeRole === role.id ? 'active' : ''}`} onClick={() => setActiveRole(role.id)}>
          <span className={`role-chip mini role-${role.id}`}>{roleInfo[role.id].short}</span>
          <span>{role.label}</span>
          <ChevronRight size={15} />
        </button>)}
      </section>

      <section className="surface permission-panel">
        <div className="permission-heading">
          <div>
            <div className="section-kicker">DANH SÁCH QUYỀN CHỨC NĂNG</div>
            <h3>Quyền của {roleInfo[activeRole].label} ({selected.length})</h3>
          </div>
          <button className="primary-button" onClick={() => void save()}>
            <Check size={16} /> {saved ? 'Đã lưu thành công' : 'Lưu quyền'}
          </button>
        </div>
        <div className="permission-groups">
          {groups.map(([group, entries]) => <div className="permission-group" key={group}>
            <h4>{permissionGroupName(group)}</h4>
            {entries.map((item) => <label className="permission-row" key={item.permission}>
              <span className="permission-copy">
                <strong>{item.permission}</strong>
                <small>{item.description}</small>
              </span>
              <input type="checkbox" checked={selected.includes(item.permission)} onChange={() => toggle(item.permission)} />
            </label>)}
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}

function UnitsPage({ session }: { session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [form, setForm] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => api<{ items: Record<string, any>[] }>('/api/units').then((result) => setItems(result.items)).catch((reason) => setError((reason as Error).message));
  useEffect(() => { void refresh(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/units', {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), name: data.get('name'), unitType: data.get('unitType'), parentId: data.get('parentId') }),
      }, session.csrfToken);
      setForm(false);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return <div className="page-stack">
    <PageHeader title="Cơ cấu tổ chức: Khoa, Bộ môn & Phòng ban" subtitle="Cấu trúc phân cấp đơn vị phục vụ quản trị nhân sự, đào tạo và phân quyền dữ liệu." eyebrow="TỔ CHỨC ĐẠI HỌC" />
    {error && <InlineAlert message={error} />}
    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Danh mục đơn vị trong trường</h3>
          <span>{items.length} đơn vị hành chính & học thuật</span>
        </div>
        <button className="primary-button" onClick={() => setForm(!form)}><Plus size={16} /> Thêm đơn vị mới</button>
      </div>

      {form && <form className="create-user-form" onSubmit={create}>
        <div className="form-title">
          <h3>Khai báo đơn vị mới</h3>
          <button type="button" className="icon-button" onClick={() => setForm(false)}><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Mã đơn vị<input name="code" required placeholder="VD: FIT, SBA, AAO..." /></label>
          <label>Tên đơn vị<input name="name" required placeholder="VD: Khoa Công nghệ Thông tin..." /></label>
          <label>Loại đơn vị<select name="unitType"><option value="faculty">Khoa (Faculty)</option><option value="department">Bộ môn (Department)</option><option value="office">Phòng ban (Office)</option><option value="center">Trung tâm (Center)</option></select></label>
          <label>Khoa trực thuộc (nếu là bộ môn)<select name="parentId" defaultValue=""><option value="">Không có</option>{items.filter((u) => u.unit_type === 'faculty').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button"><Plus size={15} /> Lưu đơn vị</button>
        </div>
      </form>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã đơn vị</th>
              <th>Tên đơn vị</th>
              <th>Phân loại</th>
              <th>Đơn vị cha</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => <tr key={u.id}>
              <td><code>{u.code}</code></td>
              <td><strong>{u.name}</strong></td>
              <td><span className="ticket-cat">{u.unit_type}</span></td>
              <td>{u.parent_name || '—'}</td>
              <td><StatusBadge status={u.status} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

function AdminAcademicPage({ section, session }: { section: string; session: Session }) {
  const [tab, setTab] = useState(section === 'schedule' ? 'sections' : section === 'courses' ? 'courses' : 'periods');
  const [courses, setCourses] = useState<Record<string, any>[]>([]);
  const [sections, setSections] = useState<Record<string, any>[]>([]);
  const [periods, setPeriods] = useState<Record<string, any>[]>([]);
  const [formOpen, setFormOpen] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const [crs, sec, per] = await Promise.all([
        api<{ items: Record<string, any>[] }>('/api/academic/courses'),
        api<{ items: Record<string, any>[] }>('/api/academic/sections'),
        api<{ items: Record<string, any>[] }>('/api/enrollment-periods'),
      ]);
      setCourses(crs.items); setSections(sec.items); setPeriods(per.items);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function createCourse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await api('/api/courses', {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), name: data.get('name'), credits: Number(data.get('credits')) }),
      }, session.csrfToken);
      setFormOpen('');
      await refresh();
    } catch (err) { setError((err as Error).message); }
  }

  async function togglePeriod(id: string, currentStatus: string) {
    try {
      await api(`/api/enrollment-periods/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: currentStatus === 'open' ? 'closed' : 'open' }),
      }, session.csrfToken);
      await refresh();
    } catch (err) { setError((err as Error).message); }
  }

  return <div className="page-stack">
    <PageHeader title="Đào tạo & Quản lý Học phần" subtitle="Kế hoạch mở lớp, danh mục môn học và các đợt đăng ký tín chỉ trực tuyến." eyebrow="QUẢN TRỊ ĐÀO TẠO" />
    {error && <InlineAlert message={error} />}

    <section className="surface data-surface">
      <div className="academic-tabs">
        <button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}>
          <BookMarked size={15} /> Danh mục học phần ({courses.length})
        </button>
        <button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')}>
          <BookOpen size={15} /> Lớp học phần & Lịch học ({sections.length})
        </button>
        <button className={tab === 'periods' ? 'active' : ''} onClick={() => setTab('periods')}>
          <CalendarDays size={15} /> Đợt đăng ký học phần ({periods.length})
        </button>
      </div>

      {tab === 'courses' && <>
        <div className="data-toolbar">
          <div>
            <h3>Danh mục học phần toàn trường</h3>
            <span>Các học phần được cấp phép giảng dạy</span>
          </div>
          <button className="primary-button" onClick={() => setFormOpen(formOpen === 'crs' ? '' : 'crs')}><Plus size={15} /> Thêm môn học</button>
        </div>

        {formOpen === 'crs' && <form className="create-user-form" onSubmit={createCourse}>
          <div className="form-grid">
            <label>Mã môn học<input name="code" required placeholder="VD: CS101, SE401..." /></label>
            <label>Tên học phần<input name="name" required placeholder="Tên môn học tiếng Việt..." /></label>
            <label>Số tín chỉ<input name="credits" type="number" min="1" max="10" defaultValue="3" required /></label>
          </div>
          <div className="form-actions"><button type="submit" className="primary-button">Lưu môn học</button></div>
        </form>}

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Mã học phần</th><th>Tên học phần</th><th>Số tín chỉ</th><th>Khoa quản lý</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {courses.map((c) => <tr key={c.id}>
                <td><code>{c.code}</code></td>
                <td><strong>{c.name}</strong></td>
                <td><span className="credit-badge">{c.credits} TC</span></td>
                <td>{c.faculty || 'Khoa CNTT'}</td>
                <td><StatusBadge status={c.status} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </>}

      {tab === 'sections' && <>
        <div className="data-toolbar">
          <div>
            <h3>Lớp học phần mở trong kỳ</h3>
            <span>Phân công giảng viên và phòng học</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Mã lớp</th><th>Học phần</th><th>Học kỳ</th><th>Phòng học</th><th>Sĩ số</th><th>Giảng viên</th></tr></thead>
            <tbody>
              {sections.map((s) => <tr key={s.id}>
                <td><code>{s.code}</code></td>
                <td><strong>{s.course}</strong></td>
                <td>{s.term} · {s.academic_year}</td>
                <td>{s.room || 'Chưa xếp phòng'}</td>
                <td>{s.enrolled_count} / {s.capacity || '∞'} SV</td>
                <td><strong>{s.lecturers || 'Chưa phân công'}</strong></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </>}

      {tab === 'periods' && <>
        <div className="data-toolbar">
          <div>
            <h3>Đợt đăng ký tín chỉ trực tuyến</h3>
            <span>Kích hoạt hoặc đóng cổng đăng ký học phần cho sinh viên</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Học kỳ</th><th>Năm học</th><th>Thời gian bắt đầu</th><th>Thời gian kết thúc</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {periods.map((p) => <tr key={p.id}>
                <td><strong>{p.term}</strong></td>
                <td>{p.academic_year}</td>
                <td>{formatDateTime(p.starts_at)}</td>
                <td>{formatDateTime(p.ends_at)}</td>
                <td><StatusBadge status={p.status === 'open' ? 'active' : 'closed'} /></td>
                <td>
                  <button className="small-primary" onClick={() => void togglePeriod(p.id, p.status)}>
                    {p.status === 'open' ? 'Đóng đợt đăng ký' : 'Mở đợt đăng ký'}
                  </button>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  </div>;
}

// -------------------------------------------------------------
// LECTURER GRADES, ASSIGNMENTS, ATTENDANCE
// -------------------------------------------------------------
function LecturerGradesPage({ session }: { session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logModalItem, setLogModalItem] = useState<Record<string, any> | null>(null);
  const [logHistory, setLogHistory] = useState<Record<string, any>[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const refresh = () => api<{ items: Record<string, any>[] }>('/api/portal/grades').then((res) => setItems(res.items || [])).catch((err) => setError((err as Error).message));
  useEffect(() => { void refresh(); }, []);

  async function saveScore(item: Record<string, any>) {
    const rawVal = scores[item.id] !== undefined ? scores[item.id] : item.score;
    const scoreVal = Number(rawVal);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 10) {
      setError('Điểm số phải là số hợp lệ từ 0 đến 10.');
      return;
    }
    setError('');
    setSavingId(item.id);
    try {
      await api(`/api/grades/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          score: scoreVal,
          reason: item.score !== null ? `Giảng viên cập nhật điểm từ ${item.score} sang ${scoreVal}` : 'Giảng viên nhập điểm mới',
        }),
      }, session.csrfToken);
      setSaved(item.id);
      setSuccess(`Đã lưu điểm ${scoreVal} cho sinh viên ${item.full_name} (Hệ thống đã ghi nhật ký kiểm toán).`);
      setTimeout(() => setSaved(''), 3000);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId('');
    }
  }

  async function viewLogs(item: Record<string, any>) {
    setLogModalItem(item);
    setLoadingLogs(true);
    try {
      const data = await api<{ items: Record<string, any>[] }>(`/api/grades/${item.id}/logs`);
      setLogHistory(data.items || []);
    } catch {
      setLogHistory([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  return <div className="page-stack">
    <PageHeader
      title="Sổ điểm điện tử & Nhập điểm sinh viên"
      subtitle="Giảng viên chủ động nhập và chỉnh sửa điểm trực tiếp. Mọi lần thay đổi điểm đều được tự động lưu nhật ký kiểm toán an toàn."
      eyebrow="NGHIỆP VỤ GIẢNG VIÊN"
    />
    {success && <div className="success-alert"><CheckCircle2 size={16} /><span>{success}</span></div>}
    {error && <InlineAlert message={error} />}

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Bảng điểm các lớp học phần</h3>
          <span>{items.length} đầu điểm thành phần · Tự động đồng bộ học vụ</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sinh viên</th>
              <th>Mã SV</th>
              <th>Lớp học phần</th>
              <th>Thành phần điểm</th>
              <th style={{ width: 140 }}>Điểm (0–10)</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const currentVal = scores[item.id] !== undefined ? scores[item.id] : (item.score ?? '');
              const isModified = scores[item.id] !== undefined && Number(scores[item.id]) !== Number(item.score);
              return (
                <tr key={item.id}>
                  <td><strong>{item.full_name}</strong></td>
                  <td><code>{item.user_code}</code></td>
                  <td>{item.course} · <code>{item.section}</code></td>
                  <td><span className="ticket-cat">{item.component}</span></td>
                  <td>
                    <input
                      className="score-input-box"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={currentVal}
                      onChange={(e) => setScores({ ...scores, [item.id]: e.target.value })}
                      placeholder="—"
                      title="Nhập điểm từ 0 đến 10"
                    />
                  </td>
                  <td>
                    <span className="badge-pill badge-primary">
                      {item.score !== null ? `Đã có điểm (${item.score})` : 'Chưa nhập'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className={`small-primary ${isModified ? 'highlight-save' : ''}`}
                        onClick={() => void saveScore(item)}
                        disabled={savingId === item.id}
                      >
                        {savingId === item.id ? <span className="spinner" /> : saved === item.id ? '✓ Đã lưu' : isModified ? 'Lưu thay đổi' : 'Cập nhật'}
                      </button>
                      <button
                        type="button"
                        className="small-secondary"
                        onClick={() => void viewLogs(item)}
                        title="Xem lịch sử chỉnh sửa điểm"
                      >
                        <FileClock size={13} /> Nhật ký
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>

    {logModalItem && (
      <div className="modal-backdrop" onClick={() => setLogModalItem(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
          <div className="modal-header">
            <div>
              <h3>Nhật ký chỉnh sửa điểm</h3>
              <p>{logModalItem.full_name} ({logModalItem.user_code}) — {logModalItem.course} ({logModalItem.component})</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setLogModalItem(null)}><X size={18} /></button>
          </div>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {loadingLogs ? (
              <div className="loading-state"><span className="spinner" /><span>Đang tải nhật ký kiểm toán...</span></div>
            ) : logHistory.length === 0 ? (
              <div className="empty-state">
                <FileClock size={32} />
                <p>Chưa có lịch sử điều chỉnh điểm nào cho mục này.</p>
              </div>
            ) : (
              <div className="audit-timeline">
                {logHistory.map((log) => (
                  <div key={log.id} className="audit-log-item">
                    <div className="audit-log-badge">
                      <span className="score-badge old">{log.old_score !== null ? log.old_score : 'Trống'}</span>
                      <span className="arrow">➔</span>
                      <span className="score-badge new">{log.new_score}</span>
                    </div>
                    <div className="audit-log-meta">
                      <strong>{log.actor_name || 'Giảng viên'}</strong>
                      <span>{log.reason || 'Cập nhật điểm trực tiếp'}</span>
                      <small>{formatDateTime(log.changed_at)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={() => setLogModalItem(null)}>Đóng</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

function LecturerAssignmentsPage({ session }: { session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [classes, setClasses] = useState<Record<string, any>[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/assignments');
      setItems(res.items || []);
    } catch (err) { setError((err as Error).message); }
  };

  useEffect(() => {
    void refresh();
    api<{ items: Record<string, any>[] }>('/api/portal/classes').then((res) => setClasses(res.items || [])).catch(() => undefined);
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await api('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          sectionId: data.get('sectionId'),
          title: data.get('title'),
          description: data.get('description'),
          dueAt: data.get('dueAt'),
        }),
      }, session.csrfToken);
      setFormOpen(false);
      await refresh();
    } catch (err) { setError((err as Error).message); }
  }

  return <div className="page-stack">
    <PageHeader title="Quản lý Bài tập & Đồ án lớp học" subtitle="Giao bài tập, thiết lập hạn nộp và chấm bài nộp của sinh viên." eyebrow="GIẢNG DẠY" />
    {error && <InlineAlert message={error} />}

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Danh sách bài tập đã giao</h3>
          <span>{items.length} bài tập</span>
        </div>
        <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={16} /> Giao bài tập mới</button>
      </div>

      {formOpen && <form className="create-user-form" onSubmit={handleCreate}>
        <div className="form-title">
          <h3>Giao bài tập mới</h3>
          <button type="button" className="icon-button" onClick={() => setFormOpen(false)}><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Lớp học phần<select name="sectionId" required><option value="">Chọn lớp phụ trách</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.course} · {c.code}</option>)}</select></label>
          <label>Tiêu đề bài tập<input name="title" required placeholder="VD: Assignment 02: Thiết kế CSDL..." /></label>
          <label>Hạn nộp bài<input name="dueAt" type="datetime-local" required /></label>
          <label className="full-width">Yêu cầu & Mô tả bài làm<textarea name="description" rows={3} placeholder="Mô tả cụ thể yêu cầu kỹ thuật..." /></label>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Hủy</button>
          <button type="submit" className="primary-button">Công bố bài tập</button>
        </div>
      </form>}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Tiêu đề bài tập</th><th>Lớp học phần</th><th>Hạn nộp</th><th>Bài nộp</th></tr></thead>
          <tbody>
            {items.map((asg) => <tr key={asg.id}>
              <td><strong>{asg.title}</strong><br /><small>{asg.description}</small></td>
              <td><code>{asg.section}</code></td>
              <td>{formatDateTime(asg.due_at)}</td>
              <td><span className="badge-pill">{asg.submissions || 0} bài đã nộp</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

function LecturerAttendancePage({ session }: { session: Session }) {
  const [classes, setClasses] = useState<Record<string, any>[]>([]);
  const [sessions, setSessions] = useState<Record<string, any>[]>([]);
  const [activeSession, setActiveSession] = useState<Record<string, any> | null>(null);
  const [students, setStudents] = useState<Record<string, any>[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [formOpen, setFormOpen] = useState(false);

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>('/api/portal/attendance');
      setSessions(res.items || []);
    } catch { /* None */ }
  };

  useEffect(() => {
    void refresh();
    api<{ items: Record<string, any>[] }>('/api/portal/classes').then((res) => setClasses(res.items || [])).catch(() => undefined);
  }, []);

  async function createSession(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await api('/api/attendance/sessions', {
        method: 'POST',
        body: JSON.stringify({ sectionId: data.get('sectionId'), heldAt: data.get('heldAt'), note: data.get('note') }),
      }, session.csrfToken);
      setFormOpen(false);
      await refresh();
    } catch (err) { window.alert((err as Error).message); }
  }

  async function openSession(item: Record<string, any>) {
    try {
      const res = await api<{ items: Record<string, any>[] }>(`/api/attendance/sessions/${item.id}/students`);
      setActiveSession(item);
      setStudents(res.items || []);
      const map: Record<string, string> = {};
      (res.items || []).forEach((st) => { map[st.student_user_id] = st.status || 'present'; });
      setSelected(map);
    } catch (err) { window.alert((err as Error).message); }
  }

  async function saveRecords() {
    if (!activeSession) return;
    const records = Object.entries(selected).map(([id, status]) => ({ studentUserId: id, status }));
    try {
      await api(`/api/attendance/sessions/${activeSession.id}/records`, {
        method: 'PUT',
        body: JSON.stringify({ records }),
      }, session.csrfToken);
      setActiveSession(null);
      await refresh();
    } catch (err) { window.alert((err as Error).message); }
  }

  return <div className="page-stack">
    <PageHeader title="Điểm danh lớp học phần" subtitle="Tạo buổi học và ghi nhận chuyên cần cho sinh viên theo từng buổi." eyebrow="QUẢN LÝ LỚP HỌC" />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>Các buổi học đã tạo</h3>
          <span>{sessions.length} buổi điểm danh</span>
        </div>
        <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={16} /> Tạo buổi điểm danh</button>
      </div>

      {formOpen && <form className="create-user-form" onSubmit={createSession}>
        <div className="form-title">
          <h3>Tạo buổi điểm danh mới</h3>
          <button type="button" className="icon-button" onClick={() => setFormOpen(false)}><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Lớp học phần<select name="sectionId" required><option value="">Chọn lớp</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.course} · {c.code}</option>)}</select></label>
          <label>Thời gian buổi học<input name="heldAt" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} required /></label>
          <label className="full-width">Ghi chú buổi học<input name="note" placeholder="VD: Buổi 3: Thực hành Design Patterns..." /></label>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Hủy</button>
          <button type="submit" className="primary-button">Tạo buổi học</button>
        </div>
      </form>}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Thời gian</th><th>Lớp học phần</th><th>Đã điểm danh</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
          <tbody>
            {sessions.map((sess) => <tr key={sess.id}>
              <td><strong>{formatDateTime(sess.held_at)}</strong></td>
              <td>{sess.course} ({sess.section})</td>
              <td><span className="badge-pill">{sess.marked_count || 0} SV</span></td>
              <td>{sess.note || '—'}</td>
              <td>
                <button className="small-primary" onClick={() => void openSession(sess)}>Điểm danh</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {activeSession && <div className="password-overlay">
      <section className="attendance-modal surface">
        <div className="modal-header">
          <div>
            <div className="section-kicker">ĐIỂM DANH SINH VIÊN</div>
            <h3>{activeSession.course} · {activeSession.section}</h3>
          </div>
          <button className="icon-button" onClick={() => setActiveSession(null)}><X size={16} /></button>
        </div>

        <div className="attendance-quick-bar">
          <button className="secondary-button small" onClick={() => {
            const next: Record<string, string> = {};
            students.forEach((s) => { next[s.student_user_id] = 'present'; });
            setSelected(next);
          }}>
            ✓ Đánh dấu tất cả có mặt
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Mã SV</th><th>Họ và tên</th><th>Trạng thái chuyên cần</th></tr></thead>
            <tbody>
              {students.map((st) => <tr key={st.student_user_id}>
                <td><code>{st.user_code}</code></td>
                <td><strong>{st.full_name}</strong></td>
                <td>
                  <select
                    className="small-select"
                    value={selected[st.student_user_id] || 'present'}
                    onChange={(e) => setSelected({ ...selected, [st.student_user_id]: e.target.value })}
                  >
                    <option value="present">Có mặt</option>
                    <option value="late">Đi muộn</option>
                    <option value="excused">Vắng có phép</option>
                    <option value="absent">Vắng không phép</option>
                  </select>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={() => setActiveSession(null)}>Đóng</button>
          <button className="primary-button" onClick={() => void saveRecords()}><Check size={15} /> Lưu kết quả điểm danh</button>
        </div>
      </section>
    </div>}
  </div>;
}

// -------------------------------------------------------------
// STAFF WORK PAGE
// -------------------------------------------------------------
function StaffWorkPage({ section, session }: { section: string; session: Session }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const isTasks = section === 'tasks';

  const refresh = async () => {
    try {
      const res = await api<{ items: Record<string, any>[] }>(isTasks ? '/api/internal-tasks' : '/api/portal/requests');
      setItems(res.items || []);
    } catch { /* None */ }
  };

  useEffect(() => { void refresh(); }, [section]);

  async function updateTask(item: Record<string, any>, status: string) {
    try {
      await api(`/api/internal-tasks/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, session.csrfToken);
      await refresh();
    } catch (err) { window.alert((err as Error).message); }
  }

  async function updateRequest(item: Record<string, any>, status: string) {
    try {
      await api(`/api/requests/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, session.csrfToken);
      await refresh();
    } catch (err) { window.alert((err as Error).message); }
  }

  return <div className="page-stack">
    <PageHeader
      eyebrow="KHÔNG GIAN CÁN BỘ NHÂN VIÊN"
      title={isTasks ? 'Nhiệm vụ & Công việc nội bộ' : 'Tiếp nhận hồ sơ & Yêu cầu sinh viên'}
      subtitle="Cập nhật tiến độ xử lý và phản hồi trực tiếp cho sinh viên Đại học Duy Tân."
    />

    <section className="surface data-surface">
      <div className="data-toolbar">
        <div>
          <h3>{isTasks ? 'Công việc được phân công' : 'Danh sách yêu cầu sinh viên'}</h3>
          <span>{items.length} mục</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{isTasks ? 'Tiêu đề công việc' : 'Tiêu đề yêu cầu'}</th>
              <th>{isTasks ? 'Thời hạn' : 'Sinh viên'}</th>
              <th>Mô tả chi tiết</th>
              <th>Trạng thái</th>
              <th>Cập nhật tiến độ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.title || item.subject}</strong></td>
                <td>{isTasks ? formatDateTime(item.due_at) : <strong>{item.student}</strong>}</td>
                <td><small>{item.description || 'Không có ghi chú'}</small></td>
                <td><StatusBadge status={item.status} /></td>
                <td>
                  <select
                    className="small-select"
                    value={item.status}
                    onChange={(e) => isTasks ? void updateTask(item, e.target.value) : void updateRequest(item, e.target.value)}
                  >
                    <option value="new">Mới tiếp nhận</option>
                    <option value="in_progress">Đang xử lý</option>
                    <option value="waiting">Chờ bổ sung</option>
                    <option value="completed">Đã hoàn thành</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

// -------------------------------------------------------------
// HELPER COMPONENTS
// -------------------------------------------------------------
function PasswordChange({ session, onChanged }: { session: Session; onChanged: (csrfToken: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (newPassword.length < 12) { setError('Mật khẩu mới cần có ít nhất 12 ký tự.'); return; }
    if (newPassword !== confirm) { setError('Mật khẩu xác nhận chưa trùng khớp.'); return; }
    setBusy(true);
    try {
      const result = await api<{ csrfToken: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }, session.csrfToken);
      onChanged(result.csrfToken);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="password-overlay">
    <form className="password-card surface" onSubmit={submit}>
      <span className="password-icon"><LockKeyhole size={22} /></span>
      <div className="eyebrow"><span className="eyebrow-line" /> BẢO MẬT TÀI KHOẢN DTU</div>
      <h2>Đổi mật khẩu tài khoản</h2>
      <p>Nhập mật khẩu hiện tại và tạo mật khẩu mới an toàn (tối thiểu 12 ký tự).</p>
      <label className="field-label">Mật khẩu hiện tại<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
      <label className="field-label">Mật khẩu mới<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} required /></label>
      <label className="field-label">Nhập lại mật khẩu mới<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
      {error && <InlineAlert message={error} />}
      <button className="primary-button login-submit" disabled={busy}>{busy ? 'Đang cập nhật…' : <>Lưu mật khẩu mới <ArrowRight size={16} /></>}</button>
    </form>
  </div>;
}

function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    active: 'active', approved: 'active', completed: 'active', present: 'active',
    pending: 'pending', submitted: 'pending', in_progress: 'pending', waiting: 'pending', new: 'pending',
    locked: 'muted', rejected: 'muted', draft: 'muted', absent: 'muted',
    paid: 'active', unpaid: 'pending', partial: 'pending', waived: 'active',
    open: 'active', closed: 'muted',
  };
  return <span className={`status-pill status-${styles[status || ''] || 'neutral'}`}>
    <span />
    {statusLabel(status)}
  </span>;
}

function EmptyState({ icon: Icon, title, description, compact = false }: { icon: LucideIcon; title: string; description: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}>
    <span className="empty-icon"><Icon size={24} /></span>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
  </div>;
}

function InlineAlert({ message }: { message: string }) {
  return <div className="form-alert inline-alert"><CircleAlert size={16} /><span>{message}</span></div>;
}

function LoadingRows() {
  return <div className="loading-rows"><span /><span /><span /></div>;
}

function ClassList({ items }: { items: Record<string, any>[] }) {
  return items.length ? <div className="simple-list">{items.slice(0, 5).map((item) => (
    <div className="simple-row" key={item.id}>
      <span className="list-icon"><BookOpen size={16} /></span>
      <span className="simple-copy">
        <strong>{item.course}</strong>
        <small>{item.code} · {item.term} · Phòng: {item.room || 'Chưa xếp'}</small>
      </span>
      <span className="simple-trailing">{item.student_count || 0} SV</span>
    </div>
  ))}</div> : <EmptyState icon={BookOpen} title="Chưa có lớp được phân công" description="" compact />;
}

function TaskList({ items }: { items: Record<string, any>[] }) {
  return items.length ? <div className="simple-list">{items.map((item) => (
    <div className="simple-row" key={item.id}>
      <span className="list-icon"><ClipboardCheck size={16} /></span>
      <span className="simple-copy">
        <strong>{item.title}</strong>
        <small>Hạn: {formatDateTime(item.due_at)}</small>
      </span>
      <StatusBadge status={item.status} />
    </div>
  ))}</div> : <EmptyState icon={ClipboardCheck} title="Chưa có nhiệm vụ" description="" compact />;
}

function ScheduleList({ items }: { items: Record<string, any>[] }) {
  return items.length ? <div className="simple-list">{items.map((item, index) => (
    <div className="simple-row" key={`${item.section}-${index}`}>
      <span className="time-badge">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][Number(item.weekday) - 1] || '—'}</span>
      <span className="simple-copy">
        <strong>{item.course}</strong>
        <small>{item.start_time} – {item.end_time} · {item.room || 'Chưa xếp phòng'}</small>
      </span>
      <span className="simple-trailing">{item.section}</span>
    </div>
  ))}</div> : <EmptyState icon={CalendarDays} title="Chưa có lịch học" description="" compact />;
}

function AuditList({ items }: { items: Record<string, any>[] }) {
  return items.length ? <div className="simple-list">{items.map((item) => (
    <div className="simple-row" key={item.id}>
      <span className="list-icon"><Activity size={16} /></span>
      <span className="simple-copy">
        <strong>{item.action}</strong>
        <small>{item.actor || 'Hệ thống'} · {item.resource_type}</small>
      </span>
      <span className="simple-trailing">{formatDateTime(item.created_at)}</span>
    </div>
  ))}</div> : <EmptyState icon={FileClock} title="Chưa có nhật ký gần đây" description="" compact />;
}

function groupNav(items: NavItem[]) {
  const groups = new Map<string, NavItem[]>();
  items.forEach((item) => groups.set(item.group, [...(groups.get(item.group) || []), item]));
  return [...groups.entries()];
}

function groupPermissions(items: Array<{ permission: string; description: string }>) {
  const groups = new Map<string, typeof items>();
  items.forEach((item) => {
    const group = item.permission.split('.')[0];
    groups.set(group, [...(groups.get(group) || []), item]);
  });
  return [...groups.entries()];
}

function permissionGroupName(group: string) {
  return ({ student: 'Sinh viên', lecturer: 'Giảng viên', staff: 'Nhân viên', admin: 'Quản trị hệ thống' } as Record<string, string>)[group] || group;
}

function canAccessNav(role: PortalRole, key: string, permissions: string[]) {
  if (key === 'dashboard') return true;
  const required: Record<PortalRole, Record<string, string | string[]>> = {
    student: {
      profile: 'student.profile.read_own', news: 'student.profile.read_own', schedule: 'student.schedule.read_own',
      enrollment: 'student.enrollment.create_own', grades: 'student.grades.read_own', curriculum: 'student.curriculum.read_own',
      assignments: 'student.assignments.read_own', syllabus: 'student.syllabus.read_own', tuition: 'student.tuition.read_own',
      payments: 'student.payments.create_own', transactions: 'student.transactions.read_own', library: 'student.library.read',
      services: 'student.requests.create_own', settings: 'student.profile.read_own',
    },
    lecturer: {
      profile: 'lecturer.profile.read_own', schedule: 'lecturer.schedule.read_assigned', classes: 'lecturer.classes.read_assigned',
      students: 'lecturer.students.read_assigned', grades: 'lecturer.grades.manage_assigned', assignments: 'lecturer.assignments.manage_assigned',
      materials: 'lecturer.classes.read_assigned', attendance: 'lecturer.attendance.manage_assigned', news: 'lecturer.news.read',
      settings: 'lecturer.profile.read_own',
    },
    staff: {
      profile: 'staff.profile.read_own', tasks: 'staff.tasks.read_assigned', requests: 'staff.requests.manage',
      operations: ['staff.academic.manage', 'staff.finance.manage'], students: 'staff.students.read_department',
      reports: 'staff.reports.read_department', news: 'staff.news.manage', settings: 'staff.profile.read_own',
    },
    admin: {
      users: 'admin.users.read', students: 'admin.users.read', lecturers: 'admin.users.read', staff: 'admin.users.read',
      units: 'admin.units.manage', education: 'admin.system.manage', courses: 'admin.system.manage', schedule: 'admin.system.manage',
      grades: 'admin.grades.approve', finance: 'admin.system.manage', news: 'admin.system.manage', permissions: 'admin.roles.manage',
      audit: 'admin.audit.read', settings: 'admin.system.manage',
    },
  };
  const perm = required[role][key];
  if (!perm) return false;
  return Array.isArray(perm) ? perm.some((p) => permissions.includes(p)) : permissions.includes(perm);
}

function isPortalRole(value?: string): value is PortalRole {
  return ['student', 'lecturer', 'staff', 'admin'].includes(value || '');
}

function roleLabel(role: string) {
  return roleInfo[role as PortalRole]?.label || role;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    active: 'Hoạt động', pending: 'Chờ duyệt', locked: 'Đã khóa', approved: 'Đã phê duyệt',
    submitted: 'Chờ xét duyệt', in_progress: 'Đang xử lý', waiting: 'Chờ bổ sung', completed: 'Đã hoàn tất',
    rejected: 'Từ chối', new: 'Mới tiếp nhận', draft: 'Bản nháp', present: 'Có mặt', absent: 'Vắng mặt',
    late: 'Đi muộn', excused: 'Vắng có phép', paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán',
    partial: 'Đã nộp một phần', waived: 'Miễn giảm', open: 'Đang mở', closed: 'Đã đóng',
  };
  return labels[status || ''] || status || 'Chưa xác định';
}

function columnName(key: string) {
  const labels: Record<string, string> = {
    user_code: 'Mã người dùng', full_name: 'Họ và tên', email: 'Email', status: 'Trạng thái',
    created_at: 'Thời gian tạo', last_login_at: 'Đăng nhập gần nhất', roles: 'Vai trò', code: 'Mã',
    name: 'Tên', unit_type: 'Loại đơn vị', parent_name: 'Đơn vị quản lý', course_code: 'Mã học phần',
    course: 'Học phần', section: 'Lớp học phần', term: 'Học kỳ', academic_year: 'Năm học',
    weekday: 'Thứ', start_time: 'Bắt đầu', end_time: 'Kết thúc', room: 'Phòng học', score: 'Điểm số',
    component: 'Thành phần điểm', title: 'Tiêu đề', document_type: 'Loại tài liệu', file_url: 'Liên kết',
    amount: 'Số tiền', due_at: 'Thời hạn', paid: 'Đã thanh toán', actor: 'Người thực hiện',
    active_role: 'Vai trò', action: 'Hành động', resource_type: 'Loại tài nguyên', resource_id: 'Mã tài nguyên',
    ip_address: 'Địa chỉ IP', category: 'Loại yêu cầu', subject: 'Tiêu đề', student: 'Sinh viên',
    major: 'Ngành học', cohort: 'Khóa', faculty: 'Khoa', audience: 'Đối tượng', published_at: 'Ngày công bố',
    enrollment_year: 'Năm nhập học', setting_name: 'Thông số hệ thống', setting_value: 'Giá trị cấu hình',
  };
  return labels[key] || key.replaceAll('_', ' ');
}

function cellValue(key: string, value: unknown) {
  if (key === 'status') return <StatusBadge status={String(value)} />;
  if (key.endsWith('_at')) return formatDateTime(String(value || ''));
  if (key === 'amount' || key === 'paid') return formatMoney(Number(value));
  if (key === 'weekday') return ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][Number(value) - 1] || String(value);
  return value === null || value === '' ? '—' : String(value);
}

function iconForSection(section: string): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    profile: UserRound, news: Newspaper, schedule: CalendarDays, enrollment: BookOpen,
    grades: TableProperties, curriculum: GraduationCap, assignments: ClipboardCheck, syllabus: FileText,
    tuition: WalletCards, payments: CreditCard, transactions: FileClock, library: BookMarked,
    services: LifeBuoy, classes: BookOpen, students: Users, materials: FolderOpen, attendance: ClipboardList,
    tasks: ClipboardCheck, requests: LifeBuoy, operations: BriefcaseBusiness, reports: Activity,
    audit: FileClock, education: GraduationCap, courses: BookMarked, finance: WalletCards, settings: Settings,
  };
  return icons[section] || Database;
}

export default App;
