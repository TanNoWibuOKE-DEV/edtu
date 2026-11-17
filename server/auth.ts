import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { hashToken } from './security.js';
import type { PortalRole } from './types.js';

function cookie(request: Request, name: string) {
  const header = request.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function sessionToken(request: Request) {
  return cookie(request, 'edtu_session');
}

export function attachSession(request: Request, response: Response, next: NextFunction) {
  const rawToken = sessionToken(request);
  if (!rawToken) return next();
  const row = db.prepare(`
    SELECT s.id AS session_id, s.active_role, s.csrf_token, u.id AS user_id, u.user_code,
           u.full_name, u.email, u.status, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')
  `).get(hashToken(rawToken)) as Record<string, string | number> | undefined;
  if (!row || row.status !== 'active') {
    response.clearCookie('edtu_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return next();
  }
  const assignment = db.prepare(`SELECT 1 AS ok FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.name = ? AND ur.revoked_at IS NULL`).get(row.user_id, row.active_role);
  if (!assignment) return next();
  const permissions = db.prepare(`
    SELECT p.id FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
    JOIN roles r ON r.id = rp.role_id WHERE r.name = ?
  `).all(row.active_role) as Array<{ id: string }>;
  request.auth = {
    userId: String(row.user_id), userCode: String(row.user_code), fullName: String(row.full_name),
    email: String(row.email), activeRole: row.active_role as PortalRole,
    permissions: new Set(permissions.map((permission) => permission.id)), csrfToken: String(row.csrf_token),
  };
  response.locals.mustChangePassword = Number(row.must_change_password) === 1;
  response.locals.sessionId = String(row.session_id);
  next();
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (!request.auth) return response.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  if (response.locals.mustChangePassword && request.path !== '/auth/change-password' && request.path !== '/auth/logout' && request.path !== '/auth/session') {
    return response.status(428).json({ error: 'Vui lòng đổi mật khẩu lần đầu trước khi tiếp tục.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

export function requirePermission(permission: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) return response.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    if (!request.auth.permissions.has(permission)) return response.status(403).json({ error: 'Bạn chưa được cấp quyền thực hiện thao tác này.' });
    next();
  };
}

export function requireCsrf(request: Request, response: Response, next: NextFunction) {
  if (!request.auth) return response.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  const origin = request.get('origin');
  const host = request.get('host');
  if (origin && new URL(origin).host !== host) return response.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
  const supplied = request.get('x-csrf-token');
  if (!supplied || supplied !== request.auth.csrfToken) return response.status(403).json({ error: 'Phiên bảo mật không hợp lệ. Hãy tải lại trang.' });
  next();
}

export function audit(action: string, resourceType: string, resourceId?: string | null, details?: unknown, request?: Request) {
  const auth = request?.auth;
  db.prepare(`INSERT INTO audit_logs(id,actor_user_id,active_role,action,resource_type,resource_id,details_json,ip_address)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    randomUUID(), auth?.userId ?? null, auth?.activeRole ?? null, action, resourceType,
    resourceId ?? null, details ? JSON.stringify(details) : null, request?.ip ?? null,
  );
}

export function allowedScopes(userId: string, role: string, resource: string) {
  return db.prepare(`SELECT scope_type, scope_id FROM data_scopes WHERE user_id = ? AND role_id = ? AND resource = ?`)
    .all(userId, role, resource) as Array<{ scope_type: string; scope_id: string | null }>;
}
