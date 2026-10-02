import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'node:path';
import { z } from 'zod';
import {
  loginSchema,
  scenarioSchema,
  reviewSchema,
  actionSchema,
  ruleSchema,
  settingsSchema,
  shareSchema,
  type Finding,
  type Inspection,
  type Alert,
} from '../../../packages/contracts/src';
import {
  q,
  transaction,
  hash,
  token,
  passwordValid,
  parse,
  uuid,
  roles,
  zone,
  getPrincipal,
  originCheck,
  setSessionCookie,
  rateLimit,
  csv,
  type AuthedRequest,
} from './common';
import { events, publish, inferenceHealth } from './engine';
import { storeImage, imageBytes, deleteImage } from './storage';
@Injectable()
class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const name = context.getHandler().name;
    if (['health', 'login', 'exchange'].includes(name)) return true;
    req.principal = await getPrincipal(req);
    if (name === 'upload') {
      roles(req.principal, 'ADMIN', 'OFFICER');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      originCheck(req);
      if (req.headers['x-csrf-token'] !== req.principal.csrf)
        throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
function safeInspection(
  row: Inspection & { storage_key?: string; uploaded_by?: string },
) {
  const { storage_key: _key, uploaded_by: _by, ...safe } = row;
  return safe;
}
function range(query: Record<string, string | undefined>) {
  const range = parse(z.enum(['1h', '24h', '7d']).default('24h'), query.range);
  const hours = range === '1h' ? 1 : range === '24h' ? 24 : 168;
  return { from: new Date(Date.now() - hours * 3600000), range };
}
async function scope(req: AuthedRequest, zoneId?: string) {
  if (zoneId) await zone(req.principal, zoneId);
  return zoneId ?? req.principal.zoneId ?? null;
}
const pageSchema = z.coerce.number().int().min(0).default(0);
const limitSchema = z.coerce.number().int().min(1).max(100).default(30);
@ApiTags('SafeSight v1')
@ApiCookieAuth()
@Controller()
@UseGuards(AuthGuard)
export class ApiController {
  @Get('health')
  @ApiOperation({ summary: 'Database and inference readiness; no credentials' })
  async health() {
    await q('SELECT 1');
    return { status: 'ok', apiVersion: 1, inference: await inferenceHealth() };
  }
  @Post('auth/login')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
      },
    },
  })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    originCheck(req);
    rateLimit(`login:${req.ip}`, 10);
    const b = parse(loginSchema, body);
    const [u] = await q(
      'SELECT u.*,m.facility_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1 ORDER BY m.facility_id LIMIT 1',
      [b.email.toLowerCase()],
    );
    // Perform a dummy scrypt on unknown users to avoid cheap account enumeration.
    const valid = passwordValid(
      b.password,
      u?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!u || !valid)
      throw new UnauthorizedException('Email or password is incorrect');
    const value = token(),
      csrf = token(),
      expires = new Date(Date.now() + 8 * 3600000);
    await transaction(async (c) => {
      if (req.cookies?.safesight_session)
        await q(
          'DELETE FROM sessions WHERE token_hash=$1',
          [hash(req.cookies.safesight_session)],
          c,
        );
      await q(
        'INSERT INTO sessions(token_hash,csrf,user_id,facility_id,expires_at) VALUES($1,$2,$3,$4,$5)',
        [hash(value), csrf, u.id, u.facility_id, expires],
        c,
      );
    });
    setSessionCookie(res, value, expires);
    return { ok: true };
  }
  @Get('auth/me') async me(@Req() req: AuthedRequest) {
    const p = req.principal;
    const [f] = await q('SELECT * FROM facilities WHERE id=$1', [p.facilityId]);
    return {
      user: {
        id: p.userId ?? p.shareId,
        name: p.name,
        email: p.email,
        role: p.role,
      },
      facility: f,
      csrf: p.csrf,
      guestZoneId: p.zoneId,
      allowImages: p.allowImages,
    };
  }
  @Post('auth/logout') async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await q('DELETE FROM sessions WHERE id=$1', [req.principal.sessionId]);
    res.clearCookie('safesight_session', { path: '/' });
    return { ok: true };
  }
  @Get('dashboard') async dashboard(@Req() req: AuthedRequest) {
    return this.snapshot(req);
  }
  @Get('facilities/:id/dashboard') async facilitySnapshot(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    if (uuid(id) !== req.principal.facilityId)
      throw new ForbiddenException('Facility membership required');
    return this.snapshot(req);
  }
  async snapshot(req: AuthedRequest) {
    const p = req.principal,
      zid = p.zoneId;
    const zs = await q(
      `SELECT z.*,r.temperature,r.humidity,r.aqi,r.observed_at,r.received_at,r.id AS reading_id,r.aqi_scale,r.source,r.simulation_run_id,s.scenario,s.running,COALESCE(sr.threshold,20) AS stale_seconds,EXISTS(SELECT 1 FROM alerts a WHERE a.zone_id=z.id AND a.severity='CRITICAL' AND (a.status<>'RESOLVED' OR a.condition_active)) AS critical,EXISTS(SELECT 1 FROM alerts a WHERE a.zone_id=z.id AND (a.status<>'RESOLVED' OR a.condition_active)) AS attention FROM zones z LEFT JOIN LATERAL (SELECT * FROM readings WHERE zone_id=z.id ORDER BY observed_at DESC LIMIT 1) r ON true LEFT JOIN simulation_runs s ON s.zone_id=z.id AND s.ended_at IS NULL LEFT JOIN rules sr ON sr.zone_id=z.id AND sr.metric='stale' WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) ORDER BY z.id`,
      [p.facilityId, zid],
    );
    const alerts = await q<Alert>(
      'SELECT a.* FROM alerts a JOIN zones z ON z.id=a.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) ORDER BY (a.resolved_at IS NULL) DESC,a.opened_at DESC LIMIT 100',
      [p.facilityId, zid],
    );
    const inspections = await q<Inspection>(
      `SELECT i.*,j.attempts FROM inspections i JOIN jobs j ON j.inspection_id=i.id JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) ORDER BY i.created_at DESC LIMIT 8`,
      [p.facilityId, zid],
    );
    const rs = await q<{ findings: Finding[] }>(
      `SELECT r.findings FROM inspections i JOIN zones z ON z.id=i.zone_id JOIN LATERAL (SELECT findings FROM reviews WHERE inspection_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND i.created_at>now()-interval '7 days'`,
      [p.facilityId, zid],
    );
    const [unreviewed] = await q(
      `SELECT count(*)::int AS n FROM inspections i JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND i.status='COMPLETED' AND i.created_at>now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.inspection_id=i.id)`,
      [p.facilityId, zid],
    );
    const persons = rs.flatMap((r) => r.findings);
    return {
      zones: zs.map((z) => {
        const stale =
          !z.observed_at ||
          Date.now() - new Date(z.observed_at).getTime() >
            z.stale_seconds * 1000;
        return {
          id: z.id,
          name: z.name,
          stale,
          state: z.critical
            ? 'critical'
            : z.attention
              ? 'warning'
              : stale
                ? 'unknown'
                : 'normal',
          scenario: z.scenario ?? 'normal',
          running: z.running ?? false,
          ppe: {
            helmetRequired: z.helmet_required,
            vestRequired: z.vest_required,
            alertsEnabled: z.ppe_alerts_enabled,
          },
          latest: z.reading_id
            ? {
                id: z.reading_id,
                zone_id: z.id,
                temperature: z.temperature,
                humidity: z.humidity,
                aqi: z.aqi,
                observed_at: z.observed_at,
                received_at: z.received_at,
                source: z.source,
                aqi_scale: z.aqi_scale,
                simulation_run_id: z.simulation_run_id,
              }
            : null,
        };
      }),
      alerts: alerts.map((a) =>
        req.principal.role === 'GUEST' ? { ...a, acknowledged_by: null } : a,
      ),
      inspections: inspections.map(safeInspection),
      generatedAt: new Date().toISOString(),
      simulationLabel:
        'Simulated environmental data · US AQI scale · no physical sensors',
      capabilities: { resetDemo: process.env.APP_MODE === 'development' },
      inference: await inferenceHealth(),
      reviewStats: {
        reviewedPersons: persons.length,
        compliantPersons: persons.filter(
          (f) => f.helmet === 'detected' && f.vest === 'detected',
        ).length,
        potentialMissingPersons: persons.filter(
          (f) =>
            f.helmet === 'potential_missing' || f.vest === 'potential_missing',
        ).length,
        unknownPersons: persons.filter(
          (f) =>
            (f.helmet === 'unknown' || f.vest === 'unknown') &&
            f.helmet !== 'potential_missing' &&
            f.vest !== 'potential_missing',
        ).length,
        unreviewedInspections: unreviewed.n,
      },
    };
  }
  @Get('events')
  @ApiOperation({
    summary:
      'Authorized SSE with heartbeat and continuous session/revocation checks',
  })
  async stream(@Req() req: AuthedRequest, @Res() res: Response) {
    const p = req.principal;
    rateLimit(`stream:${p.sessionId}`, 30);
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 2000\nevent: ready\ndata: {}\n\n');
    let closed = false;
    let validating = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      events.off('change', onChange);
      res.end();
    };
    const validate = async () => {
      try {
        await getPrincipal(req);
        return true;
      } catch {
        cleanup();
        return false;
      }
    };
    const onChange = async (event: {
      facilityId: string;
      zoneId: string | null;
      type: string;
    }) => {
      if (
        event.facilityId !== p.facilityId ||
        (p.zoneId && event.zoneId && event.zoneId !== p.zoneId) ||
        closed
      )
        return;
      if ((await validate()) && !closed)
        res.write(
          `event: change\ndata: ${JSON.stringify({ type: event.type, zoneId: event.zoneId })}\n\n`,
        );
    };
    const heartbeat = setInterval(async () => {
      if (validating || closed) return;
      validating = true;
      try {
        if ((await validate()) && !closed)
          res.write(
            `event: heartbeat\ndata: {"at":"${new Date().toISOString()}"}\n\n`,
          );
      } finally {
        validating = false;
      }
    }, 5000);
    events.on('change', onChange);
    req.on('close', cleanup);
  }
  @Get('readings') async readings(
    @Req() req: AuthedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    const zid = await scope(req, query.zoneId);
    const { from } = range(query);
    const page = parse(pageSchema, query.page),
      limit = parse(limitSchema, query.limit);
    const rows = await q(
      'SELECT r.* FROM readings r JOIN zones z ON z.id=r.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND r.observed_at>=$3 ORDER BY r.observed_at DESC LIMIT $4 OFFSET $5',
      [req.principal.facilityId, zid, from, limit, page * limit],
    );
    return { rows, page, limit };
  }
  @Get('history') async history(
    @Req() req: AuthedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    const zid = await scope(req, query.zoneId),
      { from, range: period } = range(query);
    const bucket =
      period === '1h'
        ? '15 seconds'
        : period === '24h'
          ? '5 minutes'
          : '1 hour';
    const rows = await q(
      `SELECT r.zone_id,date_bin($4::interval,r.observed_at,'2000-01-01'::timestamptz) AS observed_at,round(avg(r.temperature)::numeric,1)::float AS temperature,round(avg(r.humidity)::numeric,1)::float AS humidity,round(avg(r.aqi)::numeric,1)::float AS aqi,count(*)::int AS samples FROM readings r JOIN zones z ON z.id=r.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND r.observed_at>=$3 GROUP BY r.zone_id,2 ORDER BY 2 LIMIT 1500`,
      [req.principal.facilityId, zid, from, bucket],
    );
    return { rows, bucket, source: 'SIMULATOR', aqiScale: 'SIMULATED_US_AQI' };
  }
  @Patch('zones/:id/ppe') async updatePpe(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN');
    await zone(req.principal, id);
    const b = parse(
      z.object({
        helmetRequired: z.boolean(),
        vestRequired: z.boolean(),
        alertsEnabled: z.boolean(),
      }),
      body,
    );
    await transaction(async (c) => {
      await q(
        'UPDATE zones SET helmet_required=$2,vest_required=$3,ppe_alerts_enabled=$4 WHERE id=$1',
        [id, b.helmetRequired, b.vestRequired, b.alertsEnabled],
        c,
      );
      const active = await q(
        'SELECT * FROM alerts WHERE zone_id=$1 AND inspection_id IS NOT NULL AND condition_active=true FOR UPDATE',
        [id],
        c,
      );
      for (const a of active) {
        const fs = (a.evidence.findings ?? []) as Finding[];
        if (
          !b.alertsEnabled ||
          !fs.some(
            (f) =>
              (b.helmetRequired && f.helmet === 'potential_missing') ||
              (b.vestRequired && f.vest === 'potential_missing'),
          )
        ) {
          await q(
            'UPDATE alerts SET condition_active=false,recovered_at=now() WHERE id=$1',
            [a.id],
            c,
          );
          await q(
            'INSERT INTO alert_actions(alert_id,user_id,action,note) VALUES($1,$2,$3,$4)',
            [
              a.id,
              req.principal.userId,
              'configuration',
              'PPE condition ended after applicable zone requirements changed',
            ],
            c,
          );
        }
      }
    });
    publish(req.principal.facilityId, 'rules', id);
    return { ok: true };
  }
  @Get('rules') async rules(@Req() req: AuthedRequest) {
    roles(req.principal, 'ADMIN', 'OFFICER', 'VIEWER');
    return q(
      'SELECT r.* FROM rules r JOIN zones z ON z.id=r.zone_id WHERE z.facility_id=$1 ORDER BY z.id,r.metric',
      [req.principal.facilityId],
    );
  }
  @Patch('rules/:id')
  @ApiBody({
    schema: {
      type: 'object',
      description:
        'metric, threshold, consecutive, hysteresis, recoveryReadings, severity, enabled',
    },
  })
  async updateRule(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN');
    const b = parse(ruleSchema, body);
    const [r] = await q('SELECT * FROM rules WHERE id=$1', [uuid(id)]);
    if (!r) throw new NotFoundException('Rule not found');
    await zone(req.principal, r.zone_id);
    if (r.metric !== b.metric)
      throw new BadRequestException('Rule metric cannot change');
    await q(
      'UPDATE rules SET threshold=$2,consecutive=$3,hysteresis=$4,recovery_readings=$5,severity=$6,enabled=$7,breach_count=0,recovery_count=0 WHERE id=$1',
      [
        id,
        b.threshold,
        b.consecutive,
        b.hysteresis,
        b.recoveryReadings,
        b.severity,
        b.enabled,
      ],
    );
    if (!b.enabled) {
      await transaction(async (c) => {
        await q('UPDATE rules SET condition_active=false WHERE id=$1', [id], c);
        await q(
          'UPDATE alerts SET condition_active=false,recovered_at=now() WHERE rule_id=$1 AND condition_active=true',
          [id],
          c,
        );
      });
    }
    publish(req.principal.facilityId, 'rules', r.zone_id);
    return { ok: true };
  }
  @Post('simulation')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['zoneId', 'scenario'],
      properties: {
        zoneId: { type: 'string', format: 'uuid' },
        scenario: {
          type: 'string',
          enum: ['normal', 'temperature', 'aqi', 'recovery', 'interrupted'],
        },
        running: { type: 'boolean' },
      },
    },
  })
  async simulation(@Req() req: AuthedRequest, @Body() body: unknown) {
    roles(req.principal, 'ADMIN');
    const b = parse(scenarioSchema, body);
    await zone(req.principal, b.zoneId);
    await transaction(async (c) => {
      await q('SELECT id FROM zones WHERE id=$1 FOR UPDATE', [b.zoneId], c);
      await q(
        'UPDATE simulation_runs SET ended_at=now() WHERE zone_id=$1 AND ended_at IS NULL',
        [b.zoneId],
        c,
      );
      await q(
        'INSERT INTO simulation_runs(zone_id,scenario,running,seed) VALUES($1,$2,$3,$4)',
        [b.zoneId, b.scenario, b.running, 123],
        c,
      );
    });
    publish(req.principal.facilityId, 'simulation', b.zoneId);
    return { ok: true };
  }
  @Post('simulation/reset') async reset(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN');
    if (process.env.APP_MODE !== 'development')
      throw new ForbiddenException('Reset disabled outside development');
    parse(z.object({ confirmation: z.literal('RESET DEMO') }), body);
    // Refuse while a job is running; reset is explicitly destructive and confirmed in the UI.
    const [busy] = await q(
      "SELECT count(*)::int AS n FROM jobs j JOIN inspections i ON i.id=j.inspection_id JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND j.status='PROCESSING'",
      [req.principal.facilityId],
    );
    if (busy.n)
      throw new ConflictException(
        'Wait for active inspection jobs before resetting',
      );
    const images = await transaction(async (c) => {
      const args = [req.principal.facilityId];
      const [lockedBusy] = await q(
        "SELECT count(*)::int AS n FROM jobs j JOIN inspections i ON i.id=j.inspection_id JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND j.status='PROCESSING'",
        args,
        c,
      );
      if (lockedBusy.n)
        throw new ConflictException(
          'Wait for active inspection jobs before resetting',
        );
      const imageKeys = await q(
        'SELECT i.storage_key FROM inspections i JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1',
        args,
        c,
      );
      await q(
        'DELETE FROM alerts WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        args,
        c,
      );
      await q(
        'DELETE FROM inspections WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        args,
        c,
      );
      await q(
        'DELETE FROM readings WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        args,
        c,
      );
      await q(
        'UPDATE simulation_runs SET ended_at=now() WHERE ended_at IS NULL AND zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        args,
        c,
      );
      await q(
        "INSERT INTO simulation_runs(zone_id,scenario,seed) SELECT id,'normal',123 FROM zones WHERE facility_id=$1",
        args,
        c,
      );
      await q(
        'UPDATE rules SET breach_count=0,recovery_count=0,condition_active=false WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        args,
        c,
      );
      return imageKeys;
    });
    for (const row of images)
      await deleteImage(row.storage_key).catch(() =>
        console.error('Reset: image cleanup needs retry'),
      );
    publish(req.principal.facilityId, 'reset');
    return { ok: true };
  }
  @Get('inspections') async listInspections(
    @Req() req: AuthedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    const zid = await scope(req, query.zoneId),
      page = parse(pageSchema, query.page),
      limit = parse(limitSchema, query.limit);
    const status = parse(
      z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
      query.status,
    );
    const rows = await q<Inspection>(
      `SELECT i.*,j.attempts FROM inspections i JOIN jobs j ON j.inspection_id=i.id JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND ($3::text IS NULL OR i.status=$3) ORDER BY i.created_at DESC LIMIT $4 OFFSET $5`,
      [req.principal.facilityId, zid, status ?? null, limit, page * limit],
    );
    return { rows: rows.map(safeInspection), page, limit };
  }
  @Post('inspections')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['zoneId', 'image'],
      properties: {
        zoneId: { type: 'string', format: 'uuid' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  async upload(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER');
    const { zoneId } = parse(z.object({ zoneId: z.uuid() }), body);
    await zone(req.principal, zoneId);
    if (!file)
      throw new BadRequestException('Select a JPEG, PNG or WebP image');
    const buf = file.buffer;
    const sig = buf.subarray(0, 12);
    const valid =
      sig.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
      sig
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (sig.toString('ascii', 0, 4) === 'RIFF' &&
        sig.toString('ascii', 8, 12) === 'WEBP');
    if (!valid)
      throw new BadRequestException(
        'Unsupported file signature; use JPEG, PNG or WebP',
      );
    let normalized: Buffer, width: number, height: number;
    try {
      const input = sharp(buf, {
        limitInputPixels: 20_000_000,
        animated: false,
      });
      const meta = await input.metadata();
      if (meta.pages && meta.pages > 1)
        throw new Error('Animated images unsupported');
      const result = await input
        .rotate()
        .removeAlpha()
        .png()
        .toBuffer({ resolveWithObject: true });
      normalized = result.data;
      width = result.info.width;
      height = result.info.height;
      if (width < 32 || height < 32)
        throw new Error('Image must be at least 32×32 pixels');
    } catch {
      throw new BadRequestException(
        'Invalid image, animation or pixel limit exceeded (20MP; minimum 32×32)',
      );
    }
    const id = randomUUID();
    const key = await storeImage(id, normalized);
    try {
      await transaction(async (c) => {
        await q(
          'INSERT INTO inspections(id,zone_id,uploaded_by,mode,storage_key,original_name,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            zoneId,
            req.principal.userId,
            process.env.INFERENCE_MODE || 'DEMO',
            key,
            file.originalname.slice(0, 200),
            width,
            height,
          ],
          c,
        );
        await q('INSERT INTO jobs(inspection_id) VALUES($1)', [id], c);
      });
    } catch (e) {
      await deleteImage(key);
      throw e;
    }
    publish(req.principal.facilityId, 'inspections', zoneId);
    return { id, status: 'QUEUED' };
  }
  async inspection(req: AuthedRequest, id: string) {
    const [i] = await q<Inspection & { storage_key: string }>(
      `SELECT i.*,j.attempts FROM inspections i JOIN jobs j ON j.inspection_id=i.id WHERE i.id=$1`,
      [uuid(id)],
    );
    if (!i) throw new NotFoundException('Inspection not found');
    await zone(req.principal, i.zone_id);
    return i;
  }
  @Get('inspections/:id') async detail(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const i = await this.inspection(req, id);
    const reviews = await q(
      'SELECT r.id,r.findings,r.note,r.created_at,u.name AS reviewer_name FROM reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.inspection_id=$1 ORDER BY r.created_at DESC,r.id DESC',
      [id],
    );
    return {
      ...safeInspection(i),
      reviews:
        req.principal.role === 'GUEST'
          ? reviews.map((r) => ({ ...r, reviewer_name: 'Safety reviewer' }))
          : reviews,
    };
  }
  @Get('inspections/:id/image') async image(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    if (!req.principal.allowImages)
      throw new ForbiddenException('Guest image access disabled');
    const i = await this.inspection(req, id);
    if (i.image_deleted) throw new NotFoundException('Image deleted');
    const bytes = await imageBytes(i.storage_key);
    res
      .set({
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
  @Delete('inspections/:id/image') async removeImage(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER');
    const i = await this.inspection(req, id);
    if (['QUEUED', 'PROCESSING'].includes(i.status))
      throw new ConflictException(
        'Wait for job completion before deleting image',
      );
    if (!i.image_deleted) await deleteImage(i.storage_key);
    await q(
      'UPDATE inspections SET image_deleted=true,updated_at=now() WHERE id=$1',
      [id],
    );
    publish(req.principal.facilityId, 'inspections', i.zone_id);
    return { ok: true };
  }
  @Post('inspections/:id/retry') async retry(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER');
    const i = await this.inspection(req, id);
    if (i.image_deleted) throw new ConflictException('Image was deleted');
    await transaction(async (c) => {
      const rows = await q(
        "UPDATE jobs SET status='QUEUED',available_at=now(),locked_at=NULL WHERE inspection_id=$1 AND status='FAILED' AND attempts<3 RETURNING id",
        [id],
        c,
      );
      if (!rows.length)
        throw new ConflictException(
          'Retry requires a FAILED inspection with fewer than 3 attempts',
        );
      await q(
        "UPDATE inspections SET status='QUEUED',error=NULL,updated_at=now() WHERE id=$1",
        [id],
        c,
      );
    });
    publish(req.principal.facilityId, 'inspections', i.zone_id);
    return { ok: true };
  }
  @Post('inspections/:id/reviews')
  @ApiBody({
    schema: {
      type: 'object',
      description:
        'findings: [{personId, helmet, vest}], note (required). Original result is immutable.',
    },
  })
  async review(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER');
    const i = await this.inspection(req, id);
    if (i.status !== 'COMPLETED' || !i.result)
      throw new ConflictException('Only completed inspections can be reviewed');
    const b = parse(reviewSchema, body);
    const expected = i.result.findings.map((f) => f.personId).sort(),
      actual = b.findings.map((f) => f.personId).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new BadRequestException(
        'Review must include exactly the model person references',
      );
    await transaction(async (c) => {
      await q('SELECT id FROM inspections WHERE id=$1 FOR UPDATE', [id], c);
      await q(
        'INSERT INTO reviews(inspection_id,reviewer_id,findings,note) VALUES($1,$2,$3,$4)',
        [id, req.principal.userId, JSON.stringify(b.findings), b.note],
        c,
      );
      const [requirements] = await q(
        'SELECT helmet_required,vest_required,ppe_alerts_enabled FROM zones WHERE id=$1',
        [i.zone_id],
        c,
      );
      const missing =
        requirements.ppe_alerts_enabled &&
        b.findings.some(
          (f) =>
            (requirements.helmet_required &&
              f.helmet === 'potential_missing') ||
            (requirements.vest_required && f.vest === 'potential_missing'),
        );
      if (missing) {
        await q(
          `INSERT INTO alerts(zone_id,inspection_id,condition_key,title,severity,evidence) VALUES($1,$2,$3,'Confirmed PPE violation · reviewed snapshot','CRITICAL',$4) ON CONFLICT(zone_id,condition_key) WHERE condition_active=true DO UPDATE SET title=EXCLUDED.title,severity=EXCLUDED.severity,evidence=EXCLUDED.evidence`,
          [
            i.zone_id,
            id,
            `ppe:${id}`,
            JSON.stringify({
              mode: i.mode,
              reviewState: 'CONFIRMED',
              snapshot: true,
              findings: b.findings,
              note: b.note,
            }),
          ],
          c,
        );
      } else {
        await q(
          'UPDATE alerts SET condition_active=false,recovered_at=now(),evidence=evidence || $2::jsonb WHERE inspection_id=$1 AND condition_active=true',
          [
            id,
            JSON.stringify({
              reviewState: 'CORRECTED',
              findings: b.findings,
              note: b.note,
            }),
          ],
          c,
        );
      }
    });
    publish(req.principal.facilityId, 'inspections', i.zone_id);
    return { ok: true };
  }
  @Get('alerts') async alerts(
    @Req() req: AuthedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    const zid = await scope(req, query.zoneId),
      page = parse(pageSchema, query.page),
      limit = parse(limitSchema, query.limit);
    const status = parse(
      z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
      query.status,
    );
    return {
      rows: (
        await q(
          'SELECT a.* FROM alerts a JOIN zones z ON z.id=a.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND ($3::text IS NULL OR a.status=$3) ORDER BY a.opened_at DESC LIMIT $4 OFFSET $5',
          [req.principal.facilityId, zid, status ?? null, limit, page * limit],
        )
      ).map((a) =>
        req.principal.role === 'GUEST' ? { ...a, acknowledged_by: null } : a,
      ),
      page,
      limit,
    };
  }
  async alert(req: AuthedRequest, id: string) {
    const [a] = await q<Alert>('SELECT * FROM alerts WHERE id=$1', [uuid(id)]);
    if (!a) throw new NotFoundException('Incident not found');
    await zone(req.principal, a.zone_id);
    return req.principal.role === 'GUEST' ? { ...a, acknowledged_by: null } : a;
  }
  @Get('alerts/:id') async alertDetail(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const a = await this.alert(req, id);
    return {
      ...a,
      actions: await q(
        "SELECT a.id,a.action,a.note,a.override,a.created_at,CASE WHEN $2 THEN 'Safety staff' ELSE u.name END AS actor_name FROM alert_actions a JOIN users u ON u.id=a.user_id WHERE alert_id=$1 ORDER BY created_at DESC",
        [id, req.principal.role === 'GUEST'],
      ),
    };
  }
  @Post('alerts/:id/actions')
  @ApiBody({
    schema: {
      type: 'object',
      description:
        'action: acknowledge | resolve | note; note required; override required for active condition resolution',
    },
  })
  async action(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER');
    const a = await this.alert(req, id);
    const b = parse(actionSchema, body);
    await transaction(async (c) => {
      const [fresh] = await q<Alert>(
        'SELECT * FROM alerts WHERE id=$1 FOR UPDATE',
        [id],
        c,
      );
      if (b.action === 'acknowledge') {
        if (fresh.status !== 'OPEN')
          throw new ConflictException(
            'Only OPEN incidents can be acknowledged',
          );
        await q(
          "UPDATE alerts SET status='ACKNOWLEDGED',acknowledged_by=$2 WHERE id=$1",
          [id, req.principal.userId],
          c,
        );
      }
      if (b.action === 'resolve') {
        if (fresh.status !== 'ACKNOWLEDGED')
          throw new ConflictException(
            'Acknowledge the incident before resolving it',
          );
        if (fresh.condition_active && !b.override)
          throw new ConflictException(
            'Condition remains active. Recovery or explicit audited override is required',
          );
        await q(
          "UPDATE alerts SET status='RESOLVED',resolved_at=now(),resolution_reason=$2 WHERE id=$1",
          [id, b.note],
          c,
        );
      }
      await q(
        'INSERT INTO alert_actions(alert_id,user_id,action,note,override) VALUES($1,$2,$3,$4,$5)',
        [id, req.principal.userId, b.action, b.note, b.override],
        c,
      );
    });
    publish(req.principal.facilityId, 'alerts', a.zone_id);
    return { ok: true };
  }
  @Get('settings') async settings(@Req() req: AuthedRequest) {
    roles(req.principal, 'ADMIN', 'OFFICER', 'VIEWER');
    return {
      facility: (
        await q('SELECT * FROM facilities WHERE id=$1', [
          req.principal.facilityId,
        ])
      )[0],
      publicAppUrl: process.env.PUBLIC_APP_URL || null,
      storageAdapter: process.env.STORAGE_ADAPTER || 'local',
      inference: await inferenceHealth(),
    };
  }
  @Patch('settings') async updateSettings(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN');
    const b = parse(settingsSchema, body);
    await q('UPDATE facilities SET name=$2,timezone=$3 WHERE id=$1', [
      req.principal.facilityId,
      b.name,
      b.timezone,
    ]);
    publish(req.principal.facilityId, 'settings');
    return { ok: true };
  }
  publicUrl() {
    const value = process.env.PUBLIC_APP_URL;
    if (!value)
      throw new BadRequestException(
        'Set PUBLIC_APP_URL to a phone-reachable LAN or approved HTTPS URL; localhost QR codes are disabled',
      );
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new BadRequestException(
        'PUBLIC_APP_URL must be a reachable HTTP(S) URL without credentials, not localhost',
      );
    return url.origin;
  }
  @Get('qr') async qr(
    @Req() req: AuthedRequest,
    @Query('zoneId') zoneId?: string,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER', 'VIEWER');
    if (zoneId) await zone(req.principal, zoneId);
    const payload = `${this.publicUrl()}${zoneId ? `/zones/${zoneId}` : '/dashboard'}`;
    return {
      payload,
      dataUrl: await QRCode.toDataURL(payload, { width: 300, margin: 2 }),
      physicalScanVerified: false,
    };
  }
  @Get('samples/:name') async sample(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('name') name: string,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER', 'VIEWER');
    parse(z.enum(['equipped', 'review']), name);
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(
      path.resolve(
        process.env.FIXTURE_DIR || 'services/inference/fixtures',
        `${name}.png`,
      ),
    );
    res
      .set({
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      })
      .send(bytes);
  }
  @Get('exports/:kind') async exportCsv(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('kind') kind: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    roles(req.principal, 'ADMIN', 'OFFICER', 'VIEWER');
    parse(z.enum(['readings', 'inspections', 'incidents']), kind);
    const zid = await scope(req, query.zoneId),
      { from } = range(query);
    const table = kind === 'incidents' ? 'alerts' : kind;
    const time =
      kind === 'readings'
        ? 'observed_at'
        : kind === 'incidents'
          ? 'opened_at'
          : 'created_at';
    const rows = await q(
      `SELECT t.*${kind === 'inspections' ? ',j.attempts' : ''} FROM ${table} t JOIN zones z ON z.id=t.zone_id ${kind === 'inspections' ? 'JOIN jobs j ON j.inspection_id=t.id' : ''} WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND t.${time}>=$3 ORDER BY t.${time} DESC LIMIT 10001`,
      [req.principal.facilityId, zid, from],
    );
    if (rows.length > 10000)
      throw new BadRequestException(
        'Export exceeds 10000 rows; use a smaller range or a zone filter',
      );
    const headers =
      kind === 'readings'
        ? [
            'zone_id',
            'temperature',
            'humidity',
            'aqi',
            'aqi_scale',
            'source',
            'observed_at',
            'received_at',
            'simulation_run_id',
          ]
        : kind === 'inspections'
          ? [
              'id',
              'zone_id',
              'status',
              'mode',
              'original_name',
              'created_at',
              'attempts',
              'error',
              'result',
            ]
          : [
              'id',
              'zone_id',
              'title',
              'severity',
              'status',
              'condition_active',
              'opened_at',
              'recovered_at',
              'resolved_at',
              'resolution_reason',
              'evidence',
            ];
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="safesight-${kind}.csv"`,
        'Cache-Control': 'private, no-store',
      })
      .send(csv(rows, headers));
  }
  @Get('shares') async shares(@Req() req: AuthedRequest) {
    roles(req.principal, 'ADMIN');
    return q(
      'SELECT id,zone_id,expires_at,revoked_at,allow_images,created_at FROM share_links WHERE facility_id=$1 ORDER BY created_at DESC LIMIT 100',
      [req.principal.facilityId],
    );
  }
  @Post('shares') async createShare(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    roles(req.principal, 'ADMIN');
    const b = parse(shareSchema, body);
    if (b.zoneId) await zone(req.principal, b.zoneId);
    const base = this.publicUrl(),
      secret = token(),
      expires = new Date(Date.now() + b.expiresInHours * 3600000);
    const [s] = await q(
      'INSERT INTO share_links(facility_id,zone_id,token_hash,expires_at,allow_images,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [
        req.principal.facilityId,
        b.zoneId,
        hash(secret),
        expires,
        b.allowImages,
        req.principal.userId,
      ],
    );
    return { id: s.id, url: `${base}/guest#${secret}`, expiresAt: expires };
  }
  @Delete('shares/:id') async revoke(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    roles(req.principal, 'ADMIN');
    const rows = await q(
      'UPDATE share_links SET revoked_at=now() WHERE id=$1 AND facility_id=$2 RETURNING id',
      [uuid(id), req.principal.facilityId],
    );
    if (!rows.length) throw new NotFoundException('Share link not found');
    publish(req.principal.facilityId, 'access');
    return { ok: true };
  }
  @Post('shares/exchange') async exchange(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    originCheck(req);
    rateLimit(`share:${req.ip}`, 20);
    const b = parse(z.object({ token: z.string().min(40).max(100) }), body);
    const [share] = await q(
      'SELECT * FROM share_links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',
      [hash(b.token)],
    );
    if (!share)
      throw new UnauthorizedException('Guest link expired or revoked');
    const secret = token(),
      expires = new Date(
        Math.min(
          new Date(share.expires_at).getTime(),
          Date.now() + 8 * 3600000,
        ),
      );
    await q(
      'INSERT INTO sessions(token_hash,csrf,facility_id,share_id,expires_at) VALUES($1,$2,$3,$4,$5)',
      [hash(secret), token(), share.facility_id, share.id, expires],
    );
    setSessionCookie(res, secret, expires);
    return { ok: true };
  }
}
