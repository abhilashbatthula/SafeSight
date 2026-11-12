import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../apps/api/src/common';
test('CSV neutralizes formula payloads and escapes quotes/newlines', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell(' \t@SUM(A1)'), '"\' \t@SUM(A1)"');
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
});
test('UTC CSV timestamp has no locale or nested JSON quotes', () => {
  assert.equal(
    csvCell(new Date('2026-10-02T12:30:00Z')),
    '"2026-10-02T12:30:00.000Z"',
  );
});

import {
  inferenceResultSchema,
  equipmentListSchema,
} from '../packages/contracts/src';
const visionResult = {
  mode: 'REAL',
  analysisType: 'vision',
  provider: 'Google Gemini',
  modelVersion: 'gemini-2.5-flash',
  summary: 'Worker with visible equipment.',
  width: 480,
  height: 320,
  processingMs: 100,
  coordinateSystem: 'xyxy_pixels',
  detections: [],
  warnings: [],
  findings: [
    {
      personId: 'P1',
      description: 'Worker at the centre.',
      equipment: [
        {
          name: 'Protective gloves',
          category: 'ppe',
          status: 'worn',
          evidence: 'Gloves visible on both hands.',
        },
      ],
      requiredChecks: [],
      limitations: [],
    },
  ],
};
test('vision inventories require evidence and reject invented detection coordinates', () => {
  assert.equal(inferenceResultSchema.safeParse(visionResult).success, true);
  assert.equal(
    inferenceResultSchema.safeParse({
      ...visionResult,
      findings: [{ personId: 'P1' }],
    }).success,
    false,
  );
  assert.equal(
    inferenceResultSchema.safeParse({
      ...visionResult,
      detections: [
        {
          class: 'helmet',
          confidence: 0.99,
          box: [0, 0, 100, 100],
          personId: 'P1',
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    inferenceResultSchema.safeParse({
      ...visionResult,
      findings: [...visionResult.findings, ...visionResult.findings],
    }).success,
    false,
  );
});
test('required equipment accepts full inventories and rejects duplicates or oversized lists', () => {
  assert.deepEqual(equipmentListSchema.parse([]), []);
  assert.equal(
    equipmentListSchema.safeParse(['Hardhat', ' Hardhat ']).success,
    false,
  );
  assert.equal(
    equipmentListSchema.safeParse(
      Array.from({ length: 21 }, (_, i) => `Equipment ${i}`),
    ).success,
    false,
  );
});

const lathe = {
  machineId: 'M1',
  name: 'Lathe',
  identification: 'likely',
  description: 'Visible spindle and chuck.',
  entanglementRisk: true,
  hazards: [
    {
      name: 'Rotating chuck',
      basis: 'visible',
      details: 'The chuck is visible.',
    },
  ],
  precautions: [
    {
      phase: 'maintenance',
      action: 'Follow the approved energy-isolation procedure.',
      reason: 'Prevent unexpected startup.',
    },
  ],
  recommendedWearables: [
    {
      name: 'Safety glasses',
      category: 'ppe',
      usage: 'recommended',
      purpose: 'Protect eyes.',
      condition: 'Select for the task.',
    },
  ],
  limitations: ['Check the manual and risk assessment.'],
  questions: ['What is the machine model?'],
};
test('machinery-only results require safety guidance, unique machine IDs and safe wearable conditions', () => {
  const result = {
    ...visionResult,
    promptVersion: 'safety-v2',
    findings: [],
    machines: [lathe],
  };
  assert.equal(inferenceResultSchema.safeParse(result).success, true);
  assert.equal(
    inferenceResultSchema.safeParse({ ...result, machines: undefined }).success,
    false,
  );
  assert.equal(
    inferenceResultSchema.safeParse({ ...result, machines: [lathe, lathe] })
      .success,
    false,
  );
  assert.equal(
    inferenceResultSchema.safeParse({
      ...result,
      machines: [
        {
          ...lathe,
          recommendedWearables: [
            {
              name: 'Gloves',
              category: 'ppe',
              usage: 'recommended',
              purpose: 'Protect hands.',
              condition: 'While operating.',
            },
          ],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    inferenceResultSchema.safeParse({
      ...result,
      machines: [{ ...lathe, precautions: [] }],
    }).success,
    false,
  );
});
