import { EventEmitter } from 'node:events';
import { pool } from '../../../packages/db/src';
import { inferenceResultSchema } from '../../../packages/contracts/src';
import { q, transaction } from './common';
import { imageBytes } from './storage';
export const events = new EventEmitter();
events.setMaxListeners(200);
export function publish(
  facilityId: string,
  type: string,
  zoneId: string | null = null,
) {
  events.emit('change', {
    facilityId,
    type,
    zoneId,
    time: new Date().toISOString(),
  });
}
let stopped = false;
let workerTimer: NodeJS.Timeout | undefined;
export async function inferenceHealth() {
  try {
    const r = await fetch(`${process.env.INFERENCE_URL}/health`, {
      headers: { 'X-Inference-Key': process.env.INFERENCE_KEY || '' },
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw new Error('Private inference service unavailable');
    return (await r.json()) as {
      mode: string;
      ready: boolean;
      reason: string | null;
      modelVersion?: string;
      provider?: string;
      analysisType?: string;
      readinessScope?: string;
    };
  } catch {
    return {
      mode: process.env.INFERENCE_MODE || 'REAL',
      ready: false,
      reason:
        'Inference service unavailable; check service logs and INFERENCE_KEY',
    };
  }
}
async function processJob() {
  const job = await transaction(async (c) => {
    await q(
      "UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'FAILED' ELSE 'QUEUED' END,locked_at=NULL WHERE status='PROCESSING' AND locked_at<now()-interval '2 minutes'",
      [],
      c,
    );
    await q(
      "UPDATE inspections i SET status=j.status,error=CASE WHEN j.status='FAILED' THEN 'Abandoned job exceeded retry limit' ELSE i.error END FROM jobs j WHERE j.inspection_id=i.id AND i.status='PROCESSING' AND j.status<>'PROCESSING'",
      [],
      c,
    );
    const [j] = await q(
      "SELECT j.*,i.storage_key,i.mode,i.image_deleted,i.width,i.height,i.requirements,z.facility_id,i.zone_id FROM jobs j JOIN inspections i ON i.id=j.inspection_id JOIN zones z ON z.id=i.zone_id WHERE j.status='QUEUED' AND j.attempts<3 AND j.available_at<=now() ORDER BY j.available_at FOR UPDATE OF j SKIP LOCKED LIMIT 1",
      [],
      c,
    );
    if (!j) return null;
    await q(
      "UPDATE jobs SET status='PROCESSING',attempts=attempts+1,locked_at=now() WHERE id=$1",
      [j.id],
      c,
    );
    await q(
      "UPDATE inspections SET status='PROCESSING',error=NULL,updated_at=now() WHERE id=$1",
      [j.inspection_id],
      c,
    );
    return j;
  });
  if (!job) return;
  publish(job.facility_id, 'inspections', job.zone_id);
  try {
    if (job.image_deleted) throw new Error('Image was deleted');
    const bytes = await imageBytes(job.storage_key);
    const form = new FormData();
    form.set(
      'image',
      new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      'inspection.png',
    );
    form.set(
      'required_equipment',
      JSON.stringify(
        job.requirements.equipment ?? [
          ...(job.requirements.helmetRequired ? ['Hardhat'] : []),
          ...(job.requirements.vestRequired ? ['High-visibility vest'] : []),
        ],
      ),
    );
    form.set('operation_context', job.requirements.operationContext ?? '');
    const response = await fetch(`${process.env.INFERENCE_URL}/infer`, {
      method: 'POST',
      headers: { 'X-Inference-Key': process.env.INFERENCE_KEY || '' },
      body: form,
      signal: AbortSignal.timeout(95000),
    });
    const data = (await response.json()) as { detail?: string };
    if (!response.ok)
      throw new Error(
        typeof data.detail === 'string'
          ? data.detail
          : 'Inference service returned an error',
      );
    const parsed = inferenceResultSchema.safeParse(data);
    if (!parsed.success) throw new Error('Invalid inference response contract');
    const result = parsed.data;
    if (
      result.mode !== job.mode ||
      result.analysisType !== 'vision' ||
      result.width !== job.width ||
      result.height !== job.height ||
      !Array.isArray(result.findings) ||
      !Array.isArray(result.detections) ||
      result.coordinateSystem !== 'xyxy_pixels'
    )
      throw new Error(
        'Invalid inference contract or mode mismatch; no fallback permitted',
      );
    const required = job.requirements.equipment ?? [
      ...(job.requirements.helmetRequired ? ['Hardhat'] : []),
      ...(job.requirements.vestRequired ? ['High-visibility vest'] : []),
    ];
    const names = [...required].sort();
    if (
      result.findings.some(
        (f) =>
          JSON.stringify(
            (f.requiredChecks ?? []).map((check) => check.name).sort(),
          ) !== JSON.stringify(names),
      )
    )
      throw new Error(
        'Vision result does not cover the saved equipment checklist',
      );
    await transaction(async (c) => {
      await q(
        "UPDATE inspections SET status='COMPLETED',result=$2,updated_at=now() WHERE id=$1",
        [job.inspection_id, JSON.stringify(result)],
        c,
      );
      await q(
        "UPDATE jobs SET status='COMPLETED',locked_at=NULL WHERE id=$1",
        [job.id],
        c,
      );
      for (const d of result.detections)
        await q(
          'INSERT INTO detections(inspection_id,class,confidence,box,person_ref) VALUES($1,$2,$3,$4,$5)',
          [
            job.inspection_id,
            d.class,
            d.confidence,
            JSON.stringify(d.box),
            d.personId,
          ],
          c,
        );
    });
  } catch (e) {
    await transaction(async (c) => {
      await q(
        "UPDATE inspections SET status='FAILED',error=$2,updated_at=now() WHERE id=$1",
        [
          job.inspection_id,
          e instanceof Error ? e.message.slice(0, 500) : 'Inference failed',
        ],
        c,
      );
      await q(
        "UPDATE jobs SET status='FAILED',locked_at=NULL WHERE id=$1",
        [job.id],
        c,
      );
    });
  }
  publish(job.facility_id, 'inspections', job.zone_id);
}
export async function startEngine() {
  // Session-level advisory lock also prevents two accidentally started API instances from processing jobs twice.
  const lock = await pool.connect();
  const [r] = await q(
    'SELECT pg_try_advisory_lock(8127361) AS acquired',
    [],
    lock,
  );
  if (!r.acquired) {
    lock.release();
    throw new Error(
      'Another SafeSight API owns the job worker lock. Single-instance deployment only.',
    );
  }
  stopped = false;
  const work = async () => {
    if (stopped) return;
    try {
      await processJob();
    } catch (e) {
      console.error(
        'Job loop failed',
        e instanceof Error ? e.message : 'unknown',
      );
    }
    if (!stopped) workerTimer = setTimeout(work, 500);
  };
  void work();
  return async () => {
    stopped = true;
    clearTimeout(workerTimer);
    await q('SELECT pg_advisory_unlock(8127361)', [], lock);
    lock.release();
  };
}
