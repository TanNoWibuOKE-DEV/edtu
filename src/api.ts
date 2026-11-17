export type PortalRole = 'student' | 'lecturer' | 'staff' | 'admin';
export type UserSummary = {
  id: string;
  user_code: string;
  full_name: string;
  email: string;
  status?: string;
  avatar_url?: string | null;
  created_at?: string;
  last_login_at?: string | null;
};
export type RoleAssignment = { name: PortalRole; label: string; isPrimary: number };
export type Session = {
  user: UserSummary;
  roles: RoleAssignment[];
  activeRole: PortalRole;
  csrfToken: string;
  permissions: string[];
  mustChangePassword: boolean;
};

export async function api<T>(url: string, options: RequestInit = {}, csrfToken?: string): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Không thể kết nối đến hệ thống.') as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body.code;
    throw error;
  }
  return body as T;
}

export function formatDate(value?: string | null) {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function formatMoney(value?: number | null) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
}
