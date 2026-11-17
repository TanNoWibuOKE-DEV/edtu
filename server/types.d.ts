import type { Request } from 'express';

export type PortalRole = 'student' | 'lecturer' | 'staff' | 'admin';
export interface AuthContext {
  userId: string;
  userCode: string;
  fullName: string;
  email: string;
  activeRole: PortalRole;
  permissions: Set<string>;
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
