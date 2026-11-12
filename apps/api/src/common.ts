import { randomBytes, createHash } from 'node:crypto';
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
export const workspaceFacilityId = () =>
  uuid(process.env.APP_FACILITY_ID || '10000000-0000-4000-8000-000000000001');
export async function getPrincipal(req: Request): Promise<Principal> {
  const value = req.cookies?.safesight_session;
  if (typeof value !== 'string')
    throw new UnauthorizedException('Workspace session required');
  const [r] = await q(
    `SELECT id,facility_id,csrf FROM sessions
     WHERE token_hash=$1 AND facility_id=$2 AND user_id IS NULL
     AND share_id IS NULL AND expires_at>now()`,
    [hash(value), workspaceFacilityId()],
  );
  if (!r) throw new UnauthorizedException('Workspace session expired');
  return {
    sessionId: r.id,
    userId: null,
    facilityId: r.facility_id,
    csrf: r.csrf,
    shareId: null,
    zoneId: null,
    allowImages: true,
    name: 'Workspace review',
    email: '',
  };
}
export function originReadCheck(req: Request) {
  if (req.headers['sec-fetch-site'] === 'cross-site')
    throw new ForbiddenException('Same-origin request required');
  if (req.headers.origin) originCheck(req);
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
