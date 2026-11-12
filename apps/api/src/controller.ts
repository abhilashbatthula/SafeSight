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
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import {
  reviewSchema,
  settingsSchema,
  equipmentListSchema,
  type Inspection,
} from '../../../packages/contracts/src';
import {
  q,
  transaction,
  hash,
  token,
  parse,
  uuid,
  zone,
  getPrincipal,
  workspaceFacilityId,
  originCheck,
  originReadCheck,
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
    if (name === 'health') return true;
    if (name === 'me') {
      originReadCheck(req);
      try {
        req.principal = await getPrincipal(req);
      } catch {
        const facilityId = workspaceFacilityId();
        const [facility] = await q('SELECT id FROM facilities WHERE id=$1', [
          facilityId,
        ]);
        if (!facility)
          throw new BadRequestException(
            'Workspace is not initialized. Run database setup.',
          );
        const value = token(),
          expires = new Date(Date.now() + 24 * 3600000);
        const [session] = await q(
          'INSERT INTO sessions(token_hash,csrf,facility_id,expires_at) VALUES($1,$2,$3,$4) RETURNING id,csrf',
          [hash(value), token(), facilityId, expires],
        );
        setSessionCookie(
          context.switchToHttp().getResponse<Response>(),
          value,
          expires,
        );
        req.principal = {
          sessionId: session.id,
          csrf: session.csrf,
          facilityId,
          userId: null,
          shareId: null,
          zoneId: null,
          allowImages: true,
          name: 'Workspace review',
          email: '',
        };
      }
      return true;
    }
    req.principal = await getPrincipal(req);
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
  @Get('auth/me') async me(@Req() req: AuthedRequest) {
    const p = req.principal;
    const [f] = await q('SELECT * FROM facilities WHERE id=$1', [p.facilityId]);
    return {
      workspace: { id: p.facilityId },
      facility: f,
      csrf: p.csrf,
      allowImages: p.allowImages,
    };
  }
  @Get('workspace') async workspace(@Req() req: AuthedRequest) {
    const [target] = await q(
      'SELECT id FROM zones WHERE facility_id=$1 ORDER BY id LIMIT 1',
      [req.principal.facilityId],
    );
    return { zoneId: target?.id ?? null, inference: await inferenceHealth() };
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
    const search = parse(z.string().trim().max(200).optional(), query.search);
    const rows = await q<Inspection>(
      `SELECT i.*,j.attempts FROM inspections i JOIN jobs j ON j.inspection_id=i.id JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND ($3::text IS NULL OR i.status=$3) AND ($6::text IS NULL OR strpos(lower(i.original_name),lower($6))>0) ORDER BY i.created_at DESC,i.id DESC LIMIT $4 OFFSET $5`,
      [
        req.principal.facilityId,
        zid,
        status ?? null,
        limit,
        page * limit,
        search || null,
      ],
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
        requiredEquipment: {
          type: 'string',
          description:
            'JSON array of up to 20 equipment names; empty for inventory only',
        },
        operationContext: {
          type: 'string',
          maxLength: 1000,
          description:
            'Optional activity, material, machine model and environment context',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 },
    }),
  )
  async upload(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    const {
      zoneId,
      helmetRequired,
      vestRequired,
      requiredEquipment,
      operationContext,
    } = parse(
      z.object({
        zoneId: z.uuid(),
        helmetRequired: z.enum(['true', 'false']).optional(),
        vestRequired: z.enum(['true', 'false']).optional(),
        requiredEquipment: z.string().max(2200).optional(),
        operationContext: z.string().trim().max(1000).optional(),
      }),
      body,
    );
    const targetZone = await zone(req.principal, zoneId);
    let equipment: string[] | undefined;
    if (requiredEquipment !== undefined) {
      try {
        equipment = parse(equipmentListSchema, JSON.parse(requiredEquipment));
      } catch {
        throw new BadRequestException('Invalid required equipment checklist');
      }
    }
    const requirements = {
      operationContext: operationContext ?? '',
      ...(equipment === undefined ? {} : { equipment }),
      helmetRequired:
        helmetRequired === undefined
          ? targetZone.helmet_required
          : helmetRequired === 'true',
      vestRequired:
        vestRequired === undefined
          ? targetZone.vest_required
          : vestRequired === 'true',
    };
    if (equipment !== undefined) {
      requirements.helmetRequired = equipment.includes('Hardhat');
      requirements.vestRequired = equipment.includes('High-visibility vest');
    }
    const inference = await inferenceHealth();
    if (
      !inference.ready ||
      inference.mode !== 'REAL' ||
      inference.analysisType !== 'vision'
    )
      throw new BadRequestException(
        inference.reason || 'Photo analysis requires configured vision AI',
      );
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
        .flatten({ background: '#ffffff' })
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
          'INSERT INTO inspections(id,zone_id,uploaded_by,mode,storage_key,original_name,width,height,requirements) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            id,
            zoneId,
            req.principal.userId,
            'REAL',
            key,
            file.originalname.slice(0, 200),
            width,
            height,
            JSON.stringify(requirements),
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
      "SELECT r.id,r.findings,r.note,r.created_at,COALESCE(u.name,'Workspace review') AS reviewer_name FROM reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.inspection_id=$1 ORDER BY r.created_at DESC,r.id DESC",
      [id],
    );
    return {
      ...safeInspection(i),
      reviews,
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
  @Post('inspections/:id/reanalyze') async reanalyze(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const original = await this.inspection(req, id);
    if (original.image_deleted)
      throw new ConflictException('Image was deleted');
    if (['QUEUED', 'PROCESSING'].includes(original.status))
      throw new ConflictException('Wait for the current analysis to finish');
    const health = await inferenceHealth();
    if (
      !health.ready ||
      health.mode !== 'REAL' ||
      health.analysisType !== 'vision'
    )
      throw new BadRequestException(
        health.reason || 'Vision AI is unavailable',
      );
    const nextId = randomUUID();
    const key = await storeImage(
      nextId,
      await imageBytes(original.storage_key),
    );
    try {
      await transaction(async (c) => {
        await q(
          'INSERT INTO inspections(id,zone_id,uploaded_by,mode,storage_key,original_name,width,height,requirements) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8)',
          [
            nextId,
            original.zone_id,
            'REAL',
            key,
            original.original_name,
            original.width,
            original.height,
            JSON.stringify(original.requirements),
          ],
          c,
        );
        await q('INSERT INTO jobs(inspection_id) VALUES($1)', [nextId], c);
      });
    } catch (error) {
      await deleteImage(key);
      throw error;
    }
    publish(req.principal.facilityId, 'inspections', original.zone_id);
    return { id: nextId, status: 'QUEUED' };
  }
  @Post('inspections/:id/retry') async retry(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    const i = await this.inspection(req, id);
    if (i.image_deleted) throw new ConflictException('Image was deleted');
    const health = await inferenceHealth();
    if (
      !health.ready ||
      health.mode !== 'REAL' ||
      health.analysisType !== 'vision'
    )
      throw new BadRequestException(
        health.reason || 'Photo analysis requires configured vision AI',
      );
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
        "UPDATE inspections SET status='QUEUED',mode='REAL',error=NULL,updated_at=now() WHERE id=$1",
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
        'findings: per-person equipment inventories, note (required). Original result is immutable.',
    },
  })
  async review(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const i = await this.inspection(req, id);
    if (i.status !== 'COMPLETED' || !i.result)
      throw new ConflictException('Only completed inspections can be reviewed');
    const b = parse(reviewSchema, body);
    const expected = i.result.findings.map((f) => f.personId).sort(),
      actual = b.findings.map((f) => f.personId).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new BadRequestException(
        'Review must include exactly the analysis person references',
      );
    await transaction(async (c) => {
      await q('SELECT id FROM inspections WHERE id=$1 FOR UPDATE', [id], c);
      await q(
        'INSERT INTO reviews(inspection_id,reviewer_id,findings,note) VALUES($1,$2,$3,$4)',
        [id, req.principal.userId, JSON.stringify(b.findings), b.note],
        c,
      );
    });
    publish(req.principal.facilityId, 'inspections', i.zone_id);
    return { ok: true };
  }
  @Get('settings') async settings(@Req() req: AuthedRequest) {
    return {
      facility: (
        await q('SELECT * FROM facilities WHERE id=$1', [
          req.principal.facilityId,
        ])
      )[0],
      storageAdapter: process.env.STORAGE_ADAPTER || 'local',
      inference: await inferenceHealth(),
    };
  }
  @Patch('settings') async updateSettings(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(settingsSchema, body);
    await q('UPDATE facilities SET name=$2,timezone=$3 WHERE id=$1', [
      req.principal.facilityId,
      b.name,
      b.timezone,
    ]);
    publish(req.principal.facilityId, 'settings');
    return { ok: true };
  }
  @Get('exports/inspections') async exportCsv(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Query() query: Record<string, string | undefined>,
  ) {
    const zid = await scope(req, query.zoneId),
      { from } = range(query);
    const rows = await q(
      'SELECT i.*,j.attempts FROM inspections i JOIN jobs j ON j.inspection_id=i.id JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND ($2::uuid IS NULL OR z.id=$2) AND i.created_at>=$3 ORDER BY i.created_at DESC LIMIT 10001',
      [req.principal.facilityId, zid, from],
    );
    if (rows.length > 10000)
      throw new BadRequestException(
        'Export exceeds 10000 rows; choose a smaller range',
      );
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="safesight-inspections.csv"',
        'Cache-Control': 'private, no-store',
      })
      .send(
        csv(rows, [
          'id',
          'status',
          'original_name',
          'created_at',
          'attempts',
          'error',
          'requirements',
          'result',
        ]),
      );
  }
}
