import { z } from 'zod';
export const API_VERSION = 1;
export const roles = ['ADMIN', 'OFFICER', 'VIEWER'] as const;
export type Role = (typeof roles)[number];
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export const scenarioSchema = z.object({
  zoneId: z.uuid(),
  scenario: z.enum(['normal', 'temperature', 'aqi', 'recovery', 'interrupted']),
  running: z.boolean().default(true),
});
export const ruleSchema = z.object({
  metric: z.enum(['temperature', 'aqi', 'stale']),
  threshold: z.number().min(1).max(500),
  consecutive: z.number().int().min(1).max(30),
  hysteresis: z.number().min(0).max(100),
  recoveryReadings: z.number().int().min(1).max(30),
  severity: z.enum(['WARNING', 'CRITICAL']),
  enabled: z.boolean(),
});
export const findingSchema = z.object({
  personId: z.string().min(1).max(50),
  helmet: z.enum(['detected', 'potential_missing', 'unknown']),
  vest: z.enum(['detected', 'potential_missing', 'unknown']),
});
export const reviewSchema = z.object({
  findings: z.array(findingSchema).max(100),
  note: z.string().min(3).max(2000),
});
export const actionSchema = z.object({
  action: z.enum(['acknowledge', 'resolve', 'note']),
  note: z.string().min(3).max(2000),
  override: z.boolean().default(false),
});
export const settingsSchema = z.object({
  name: z.string().min(3).max(100),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA timezone'),
});
export const shareSchema = z.object({
  zoneId: z.uuid().nullable(),
  expiresInHours: z.number().min(0.01).max(168),
  allowImages: z.boolean().default(false),
});
export type Finding = z.infer<typeof findingSchema>;
export interface Detection {
  class: string;
  confidence: number;
  box: [number, number, number, number];
  personId: string | null;
}
export interface InferenceResult {
  mode: 'REAL' | 'DEMO';
  modelVersion: string;
  width: number;
  height: number;
  processingMs: number;
  coordinateSystem: 'xyxy_pixels';
  detections: Detection[];
  findings: Finding[];
  warnings: string[];
}
export interface Zone {
  id: string;
  name: string;
  state: 'normal' | 'warning' | 'critical' | 'unknown';
  stale: boolean;
  latest: Reading | null;
  scenario: string;
  running: boolean;
  ppe: {
    helmetRequired: boolean;
    vestRequired: boolean;
    alertsEnabled: boolean;
  };
}
export interface Reading {
  id: string;
  zone_id: string;
  temperature: number;
  humidity: number;
  aqi: number;
  aqi_scale: string;
  source: string;
  observed_at: string;
  received_at: string;
  simulation_run_id: string;
}
export interface Alert {
  id: string;
  zone_id: string;
  rule_id: string | null;
  inspection_id: string | null;
  title: string;
  severity: 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  condition_active: boolean;
  evidence: Record<string, unknown>;
  opened_at: string;
  recovered_at: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  acknowledged_by: string | null;
}
export interface Review {
  id: string;
  findings: Finding[];
  note: string;
  created_at: string;
  reviewer_name: string;
}
export interface Inspection {
  id: string;
  zone_id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  mode: 'REAL' | 'DEMO';
  created_at: string;
  result: InferenceResult | null;
  error: string | null;
  attempts: number;
  width: number;
  height: number;
  image_deleted: boolean;
  reviews?: Review[];
  original_name: string;
}
export interface Auth {
  user: { id: string; name: string; email: string; role: Role | 'GUEST' };
  facility: { id: string; name: string; timezone: string };
  csrf: string;
  guestZoneId?: string | null;
  allowImages?: boolean;
}
export interface Snapshot {
  zones: Zone[];
  alerts: Alert[];
  inspections: Inspection[];
  generatedAt: string;
  simulationLabel: string;
  capabilities: { resetDemo: boolean };
  inference: { mode: string; ready: boolean; reason: string | null };
  reviewStats: {
    reviewedPersons: number;
    compliantPersons: number;
    potentialMissingPersons: number;
    unknownPersons: number;
    unreviewedInspections: number;
  };
}
export interface Rule {
  id: string;
  zone_id: string;
  metric: 'temperature' | 'aqi' | 'stale';
  threshold: number;
  consecutive: number;
  hysteresis: number;
  recovery_readings: number;
  severity: 'WARNING' | 'CRITICAL';
  enabled: boolean;
}
export const inferenceResultSchema = z
  .object({
    mode: z.enum(['REAL', 'DEMO']),
    modelVersion: z.string().min(1).max(200),
    width: z.number().int().min(32).max(20000),
    height: z.number().int().min(32).max(20000),
    processingMs: z.number().min(0),
    coordinateSystem: z.literal('xyxy_pixels'),
    detections: z
      .array(
        z.object({
          class: z.string().min(1).max(100),
          confidence: z.number().min(0).max(1),
          box: z.tuple([
            z.number().min(0),
            z.number().min(0),
            z.number().min(0),
            z.number().min(0),
          ]),
          personId: z.string().max(50).nullable(),
        }),
      )
      .max(1000),
    findings: z.array(findingSchema).max(100),
    warnings: z.array(z.string().max(1000)).max(100),
  })
  .superRefine((r, ctx) => {
    for (const d of r.detections)
      if (
        d.box[0] >= d.box[2] ||
        d.box[1] >= d.box[3] ||
        d.box[2] > r.width ||
        d.box[3] > r.height
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Detection box outside normalized image bounds',
        });
    if (new Set(r.findings.map((f) => f.personId)).size !== r.findings.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate person references' });
  });
