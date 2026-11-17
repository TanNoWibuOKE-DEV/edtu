import { db, inTransaction, migrate } from './db.js';
import { hashPassword, id } from './security.js';

migrate();

const userCode = String(process.env.ADMIN_USER_CODE || '').trim();
const fullName = String(process.env.ADMIN_NAME || '').trim();
const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');

if (!userCode || !fullName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
  console.error('Set ADMIN_USER_CODE, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) from an authorized university-issued account.');
  process.exitCode = 1;
} else if (db.prepare(`SELECT 1 AS ok FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin' AND ur.revoked_at IS NULL`).get()) {
  console.error('An active admin role already exists; bootstrap is disabled.');
  process.exitCode = 1;
} else {
  try {
    const accountId = id();
    inTransaction(() => {
      db.prepare(`INSERT INTO users(id,user_code,full_name,email,password_hash,status,must_change_password) VALUES (?,?,?,?,?,'active',1)`)
        .run(accountId, userCode, fullName, email, hashPassword(password));
      db.prepare(`INSERT INTO user_roles(id,user_id,role_id,is_primary) VALUES (?,?, 'admin',1)`).run(id(), accountId);
      db.prepare(`INSERT INTO audit_logs(id,actor_user_id,active_role,action,resource_type,resource_id,details_json)
        VALUES (?,?, 'admin','bootstrap.create','user',?,'{"source":"authorized first-run bootstrap"}')`).run(id(), accountId, accountId);
    });
    console.log(`Created initial admin account ${userCode}. A password change is required at first login.`);
  } catch (error) {
    console.error('Could not create the initial admin account:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

db.close();
