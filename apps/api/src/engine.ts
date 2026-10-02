import { EventEmitter } from 'node:events';
import type { PoolClient } from 'pg';
import { pool } from '../../../packages/db/src';
import {
  inferenceResultSchema,
  type Rule,
} from '../../../packages/contracts/src';
import { q, transaction } from './common';
import { nextReading, stepCondition } from './rules';
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
let simulatorTimer: NodeJS.Timeout | undefined;
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
    };
  } catch {
    return {
      mode: process.env.INFERENCE_MODE || 'DEMO',
      ready: false,
      reason:
        'Inference service unavailable; check service logs and INFERENCE_KEY',
    };
  }
}
async function evaluate(
  rule: Rule & {
    condition_active: boolean;
    breach_count: number;
    recovery_count: number;
  },
  value: number,
  c: PoolClient,
) {
  const before = rule.condition_active;
  const state = stepCondition(
    {
      breachCount: rule.breach_count,
      recoveryCount: rule.recovery_count,
      active: before,
    },
    value,
    {
      threshold: rule.threshold,
      consecutive: rule.consecutive,
      hysteresis: rule.hysteresis,
      recoveryReadings: rule.recovery_readings,
    },
  );
  await q(
    'UPDATE rules SET breach_count=$2,recovery_count=$3,condition_active=$4 WHERE id=$1',
    [rule.id, state.breachCount, state.recoveryCount, state.active],
    c,
  );
  if (!before && state.active) {
    await q(
      `INSERT INTO alerts(zone_id,rule_id,condition_key,title,severity,evidence) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(zone_id,condition_key) WHERE condition_active=true DO NOTHING`,
      [
        rule.zone_id,
        rule.id,
        `rule:${rule.id}`,
        `${rule.metric === 'stale' ? 'Interrupted readings' : rule.metric === 'aqi' ? 'Simulated AQI above demo limit' : 'Temperature above demo limit'}`,
        rule.severity,
        JSON.stringify({
          metric: rule.metric,
          value,
          threshold: rule.threshold,
          consecutive: rule.consecutive,
          source: 'SIMULATOR',
          disclaimer:
            'Demonstration limit; not certified occupational exposure guidance',
        }),
      ],
      c,
    );
  }
  if (before && !state.active)
    await q(
      'UPDATE alerts SET condition_active=false,recovered_at=now() WHERE rule_id=$1 AND condition_active=true',
      [rule.id],
      c,
    );
}
export async function tickSimulator() {
  const affected = await transaction(async (c) => {
    const runs = await q(
      `SELECT s.*,z.facility_id FROM simulation_runs s JOIN zones z ON z.id=s.zone_id WHERE ended_at IS NULL ORDER BY s.zone_id FOR UPDATE OF s`,
      [],
      c,
    );
    for (const run of runs) {
      const [latest] = await q<{
        temperature: number;
        humidity: number;
        aqi: number;
        observed_at: string;
      }>(
        'SELECT * FROM readings WHERE zone_id=$1 ORDER BY observed_at DESC LIMIT 1',
        [run.zone_id],
        c,
      );
      const rules = await q<
        Rule & {
          condition_active: boolean;
          breach_count: number;
          recovery_count: number;
        }
      >(
        'SELECT * FROM rules WHERE zone_id=$1 AND enabled=true FOR UPDATE',
        [run.zone_id],
        c,
      );
      if (run.running && run.scenario !== 'interrupted') {
        const reading = nextReading(
          latest ?? { temperature: 27, humidity: 52, aqi: 45 },
          run.scenario,
          run.seed,
          run.tick,
        );
        await q(
          'INSERT INTO readings(zone_id,temperature,humidity,aqi,simulation_run_id) VALUES($1,$2,$3,$4,$5)',
          [
            run.zone_id,
            reading.temperature,
            reading.humidity,
            reading.aqi,
            run.id,
          ],
          c,
        );
        await q(
          'UPDATE simulation_runs SET tick=tick+1 WHERE id=$1',
          [run.id],
          c,
        );
        for (const rule of rules)
          if (rule.metric !== 'stale')
            await evaluate(rule, reading[rule.metric], c);
      }
      const staleRule = rules.find((r) => r.metric === 'stale');
      if (staleRule) {
        const staleSeconds =
          run.running && run.scenario !== 'interrupted'
            ? 0
            : latest
              ? (Date.now() - new Date(latest.observed_at).getTime()) / 1000
              : staleRule.threshold + 1;
        await evaluate(staleRule, staleSeconds, c);
      }
    }
    // Bounded 7-day raw retention; jobs/sessions are similarly bounded.
    await q(
      "DELETE FROM readings WHERE observed_at < now()-interval '7 days'",
      [],
      c,
    );
    await q('DELETE FROM sessions WHERE expires_at<now()', [], c);
    return runs.map((r) => ({
      facilityId: r.facility_id as string,
      zoneId: r.zone_id as string,
    }));
  });
  affected.forEach((r) => publish(r.facilityId, 'readings', r.zoneId));
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
      "SELECT j.*,i.storage_key,i.mode,i.image_deleted,i.width,i.height,z.facility_id,z.helmet_required,z.vest_required,z.ppe_alerts_enabled,i.zone_id FROM jobs j JOIN inspections i ON i.id=j.inspection_id JOIN zones z ON z.id=i.zone_id WHERE j.status='QUEUED' AND j.attempts<3 AND j.available_at<=now() ORDER BY j.available_at FOR UPDATE OF j SKIP LOCKED LIMIT 1",
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
    const response = await fetch(`${process.env.INFERENCE_URL}/infer`, {
      method: 'POST',
      headers: { 'X-Inference-Key': process.env.INFERENCE_KEY || '' },
      body: form,
      signal: AbortSignal.timeout(60000),
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
      result.width !== job.width ||
      result.height !== job.height ||
      !Array.isArray(result.findings) ||
      !Array.isArray(result.detections) ||
      result.coordinateSystem !== 'xyxy_pixels'
    )
      throw new Error(
        'Invalid inference contract or mode mismatch; no fallback permitted',
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
      const [requirements] = await q(
        'SELECT helmet_required,vest_required,ppe_alerts_enabled FROM zones WHERE id=$1',
        [job.zone_id],
        c,
      );
      if (
        requirements.ppe_alerts_enabled &&
        result.findings.some(
          (f) =>
            (requirements.helmet_required &&
              f.helmet === 'potential_missing') ||
            (requirements.vest_required && f.vest === 'potential_missing'),
        )
      )
        await q(
          `INSERT INTO alerts(zone_id,inspection_id,condition_key,title,severity,evidence) VALUES($1,$2,$3,$4,'WARNING',$5) ON CONFLICT(zone_id,condition_key) WHERE condition_active=true DO NOTHING`,
          [
            job.zone_id,
            job.inspection_id,
            `ppe:${job.inspection_id}`,
            'Potential PPE finding · needs review',
            JSON.stringify({
              mode: result.mode,
              reviewState: 'UNREVIEWED',
              snapshot: true,
              findings: result.findings,
            }),
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
  // Session-level advisory lock also prevents two accidentally started API instances from generating twice.
  const lock = await pool.connect();
  const [r] = await q(
    'SELECT pg_try_advisory_lock(8127361) AS acquired',
    [],
    lock,
  );
  if (!r.acquired) {
    lock.release();
    throw new Error(
      'Another SafeSight API owns the simulator/job lock. Single-instance deployment only.',
    );
  }
  stopped = false;
  const simulate = async () => {
    if (stopped) return;
    try {
      await tickSimulator();
    } catch (e) {
      console.error(
        'Simulator tick failed',
        e instanceof Error ? e.message : 'unknown',
      );
    }
    if (!stopped) simulatorTimer = setTimeout(simulate, 5000);
  };
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
  void simulate();
  void work();
  return async () => {
    stopped = true;
    clearTimeout(simulatorTimer);
    clearTimeout(workerTimer);
    await q('SELECT pg_advisory_unlock(8127361)', [], lock);
    lock.release();
  };
}
