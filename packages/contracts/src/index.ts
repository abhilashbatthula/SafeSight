import { z } from 'zod';
export const API_VERSION = 1;
export const equipmentSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(['ppe', 'workwear', 'equipment']),
  status: z.enum(['worn', 'carried', 'uncertain']),
  evidence: z.string().min(1).max(600),
});
export const requiredCheckSchema = z.object({
  name: z.string().min(1).max(100),
  status: z.enum(['observed', 'not_observed', 'uncertain']),
  evidence: z.string().min(1).max(600),
});
export const equipmentListSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(20)
  .refine(
    (items) => new Set(items).size === items.length,
    'Duplicate equipment names',
  );
export const findingSchema = z.object({
  personId: z.string().min(1).max(50),
  helmet: z
    .enum(['detected', 'potential_missing', 'unknown'])
    .default('unknown'),
  vest: z.enum(['detected', 'potential_missing', 'unknown']).default('unknown'),
  description: z.string().max(500).optional(),
  equipment: z.array(equipmentSchema).max(60).optional(),
  requiredChecks: z.array(requiredCheckSchema).max(20).optional(),
  limitations: z.array(z.string().max(1000)).max(20).optional(),
});
export const machineSchema = z
  .object({
    machineId: z.string().min(1).max(50),
    name: z.string().min(1).max(120),
    identification: z.enum(['identified', 'likely', 'uncertain']),
    description: z.string().min(1).max(800),
    entanglementRisk: z.boolean(),
    hazards: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          basis: z.enum(['visible', 'typical']),
          details: z.string().min(1).max(800),
        }),
      )
      .min(1)
      .max(20),
    precautions: z
      .array(
        z.object({
          phase: z.enum([
            'before_use',
            'operation',
            'maintenance',
            'emergency',
          ]),
          action: z.string().min(1).max(800),
          reason: z.string().min(1).max(600),
        }),
      )
      .min(1)
      .max(40),
    recommendedWearables: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          category: z.enum(['ppe', 'clothing', 'safety_device']),
          usage: z.enum([
            'recommended',
            'task_dependent',
            'avoid_during_operation',
          ]),
          purpose: z.string().min(1).max(600),
          condition: z.string().min(1).max(600),
        }),
      )
      .min(1)
      .max(25),
    limitations: z.array(z.string().min(1).max(1000)).min(1).max(20),
    questions: z.array(z.string().min(1).max(1000)).max(10),
  })
  .superRefine((machine, ctx) => {
    if (
      machine.entanglementRisk &&
      machine.recommendedWearables.some(
        (item) =>
          item.usage === 'recommended' && /glove|gauntlet/i.test(item.name),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Unsafe unconditional glove recommendation for rotating machinery',
      });
  });
export type Machine = z.infer<typeof machineSchema>;
export const reviewSchema = z.object({
  findings: z.array(findingSchema).max(100),
  note: z.string().min(3).max(2000),
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
  analysisType?: 'vision';
  provider?: string;
  promptVersion?: string;
  summary?: string;
  width: number;
  height: number;
  processingMs: number;
  coordinateSystem: 'xyxy_pixels';
  detections: Detection[];
  findings: Finding[];
  machines?: Machine[];
  warnings: string[];
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
  requirements: {
    helmetRequired: boolean;
    vestRequired: boolean;
    equipment?: string[];
    operationContext?: string;
  };
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
  workspace: { id: string };
  facility: { id: string; name: string; timezone: string };
  csrf: string;
  allowImages?: boolean;
}
export const inferenceResultSchema = z
  .object({
    mode: z.enum(['REAL', 'DEMO']),
    modelVersion: z.string().min(1).max(200),
    analysisType: z.literal('vision').optional(),
    provider: z.string().max(100).optional(),
    promptVersion: z.string().max(100).optional(),
    summary: z.string().max(1500).optional(),
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
    machines: z.array(machineSchema).max(20).optional(),
    warnings: z.array(z.string().max(1000)).max(100),
  })
  .superRefine((r, ctx) => {
    if (r.promptVersion === 'safety-v2' && !r.machines)
      ctx.addIssue({
        code: 'custom',
        message: 'Missing machinery safety analysis',
      });
    if (
      r.machines &&
      new Set(r.machines.map((machine) => machine.machineId)).size !==
        r.machines.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate machine references' });
    if (
      r.analysisType === 'vision' &&
      (!r.summary ||
        !r.provider ||
        r.findings.some(
          (f) =>
            !f.description ||
            !f.equipment ||
            !f.requiredChecks ||
            !f.limitations,
        ))
    )
      ctx.addIssue({ code: 'custom', message: 'Incomplete vision inventory' });
    if (r.analysisType === 'vision' && r.detections.length)
      ctx.addIssue({
        code: 'custom',
        message:
          'Vision inventories do not provide detection boxes or confidence scores',
      });
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
