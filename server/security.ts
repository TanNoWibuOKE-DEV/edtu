import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, key] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const candidate = scryptSync(password, salt, expected.length);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
