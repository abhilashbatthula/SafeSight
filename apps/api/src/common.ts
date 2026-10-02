import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { QueryResultRow, PoolClient } from 'pg';
import { pool } from '../../../packages/db/src';
import { z } from 'zod';
export interface Principal {
  sessionId: string;
  userId: string | null;
  facilityId: string;
  role: 'ADMIN' | 'OFFICER' | 'VIEWER' | 'GUEST';
  csrf: string;
  shareId: string | null;
  zoneId: string | null;
  allowImages: boolean;
  name: string;
  email: string;
}
export type AuthedRequest = Request & { principal: Principal };
export async function q<T extends QueryResultRow = QueryResultRow>(
  query: string,
  args: unknown[] = [],
  client: PoolClient | typeof pool = pool,
): Promise<T[]> {
  return (await client.query<T>(query, args)).rows;
}
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(8127362)');
    const r = await work(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordValid(password: string, passwordHash: string) {
  const [salt, digest] = passwordHash.split(':');
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
    );
  return r.data;
}
export function uuid(v: unknown): string {
  return parse(z.uuid(), v);
}
export function roles(p: Principal, ...allowed: string[]) {
  if (!allowed.includes(p.role))
    throw new ForbiddenException('Your role cannot perform this action');
}
export async function zone(p: Principal, id: string) {
  uuid(id);
  const [r] = await q('SELECT * FROM zones WHERE id=$1 AND facility_id=$2', [
    id,
    p.facilityId,
  ]);
  if (!r || (p.zoneId && p.zoneId !== id))
    throw new ForbiddenException('Zone is outside your permitted scope');
  return r;
}
export async function getPrincipal(req: Request): Promise<Principal> {
  const value = req.cookies?.safesight_session;
  if (typeof value !== 'string')
    throw new UnauthorizedException('Sign in required');
  const [r] = await q(
    `SELECT s.id,s.user_id,s.facility_id,s.csrf,s.share_id,sl.zone_id,sl.allow_images,u.name,u.email,m.role
 FROM sessions s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN memberships m ON m.user_id=s.user_id AND m.facility_id=s.facility_id LEFT JOIN share_links sl ON sl.id=s.share_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND ((s.user_id IS NOT NULL AND m.id IS NOT NULL) OR (sl.revoked_at IS NULL AND sl.expires_at>now()))`,
    [hash(value)],
  );
  if (!r) throw new UnauthorizedException('Session expired or access revoked');
  return {
    sessionId: r.id,
    userId: r.user_id,
    facilityId: r.facility_id,
    csrf: r.csrf,
    shareId: r.share_id,
    zoneId: r.zone_id ?? null,
    allowImages: r.share_id ? Boolean(r.allow_images) : true,
    role: r.share_id ? 'GUEST' : r.role,
    name: r.name ?? 'Guest viewer',
    email: r.email ?? '',
  };
}
export function originCheck(req: Request) {
  const expected = `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers.host}`;
  if (req.headers.origin !== expected)
    throw new ForbiddenException('Same-origin request required');
}
export function setSessionCookie(res: Response, value: string, expires: Date) {
  res.cookie('safesight_session', value, {
    httpOnly: true,
    secure:
      process.env.COOKIE_SECURE === 'true' ||
      process.env.PUBLIC_APP_URL?.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    expires,
  });
  res.setHeader('Cache-Control', 'no-store');
}
export function csvCell(value: unknown) {
  let v =
    value == null
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
  if (/^[\s]*[=+\-@]/.test(v)) v = "'" + v;
  return `"${v.replaceAll('"', '""')}"`;
}
export function csv(rows: Record<string, unknown>[], headers: string[]) {
  return [
    headers.map(csvCell).join(','),
    ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(',')),
  ].join('\r\n');
}
export const rateBuckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, max: number) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || b.until < now) {
    b = { count: 0, until: now + 60000 };
    rateBuckets.set(key, b);
  }
  if (++b.count > max)
    throw new HttpException('Rate limit reached. Retry in a minute.', 429);
  if (rateBuckets.size > 10000) {
    for (const [k, v] of rateBuckets) if (v.until < now) rateBuckets.delete(k);
  }
}
