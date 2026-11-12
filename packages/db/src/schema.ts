import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
const id = () => uuid('id').primaryKey().defaultRandom();
const at = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const facilities = pgTable('facilities', {
  id: id(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
});
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at'),
});
export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    role: text('role').notNull(),
  },
  (t) => [
    uniqueIndex('membership_unique').on(t.userId, t.facilityId),
    check('membership_role', sql`${t.role} in ('ADMIN','OFFICER','VIEWER')`),
  ],
);
export const zones = pgTable(
  'zones',
  {
    id: id(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    name: text('name').notNull(),
    helmetRequired: boolean('helmet_required').notNull().default(true),
    vestRequired: boolean('vest_required').notNull().default(true),
    ppeAlertsEnabled: boolean('ppe_alerts_enabled').notNull().default(true),
  },
  (t) => [uniqueIndex('zone_name').on(t.facilityId, t.name)],
);
export const shareLinks = pgTable('share_links', {
  id: id(),
  facilityId: uuid('facility_id')
    .notNull()
    .references(() => facilities.id),
  zoneId: uuid('zone_id').references(() => zones.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: at('expires_at'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  allowImages: boolean('allow_images').notNull().default(false),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: at('created_at'),
});
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    csrf: text('csrf').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    shareId: uuid('share_id').references(() => shareLinks.id, {
      onDelete: 'cascade',
    }),
    expiresAt: at('expires_at'),
  },
  (t) => [
    check(
      'session_principal',
      sql`${t.userId} is null or ${t.shareId} is null`,
    ),
  ],
);
export const simulationRuns = pgTable(
  'simulation_runs',
  {
    id: id(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    scenario: text('scenario').notNull(),
    running: boolean('running').notNull().default(true),
    seed: integer('seed').notNull(),
    tick: integer('tick').notNull().default(0),
    createdAt: at('created_at'),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('one_current_run')
      .on(t.zoneId)
      .where(sql`${t.endedAt} is null`),
  ],
);
export const readings = pgTable(
  'readings',
  {
    id: id(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    temperature: doublePrecision('temperature').notNull(),
    humidity: doublePrecision('humidity').notNull(),
    aqi: doublePrecision('aqi').notNull(),
    aqiScale: text('aqi_scale').notNull().default('SIMULATED_US_AQI'),
    source: text('source').notNull().default('SIMULATOR'),
    observedAt: at('observed_at'),
    receivedAt: at('received_at'),
    simulationRunId: uuid('simulation_run_id')
      .notNull()
      .references(() => simulationRuns.id),
  },
  (t) => [
    index('readings_zone_time').on(t.zoneId, t.observedAt),
    check(
      'reading_bounds',
      sql`${t.humidity} between 0 and 100 and ${t.aqi} between 0 and 500`,
    ),
  ],
);
export const inspections = pgTable(
  'inspections',
  {
    id: id(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    status: text('status').notNull().default('QUEUED'),
    mode: text('mode').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    requirements: jsonb('requirements')
      .notNull()
      .default({ helmetRequired: true, vestRequired: true }),
    result: jsonb('result'),
    error: text('error'),
    imageDeleted: boolean('image_deleted').notNull().default(false),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
  },
  (t) => [
    index('inspections_zone_status').on(t.zoneId, t.status),
    check(
      'inspection_status',
      sql`${t.status} in ('QUEUED','PROCESSING','COMPLETED','FAILED')`,
    ),
    check('inspection_mode', sql`${t.mode} in ('REAL','DEMO')`),
  ],
);
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .unique()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    availableAt: at('available_at'),
  },
  (t) => [
    index('jobs_status_time').on(t.status, t.availableAt),
    check('job_attempts', sql`${t.attempts} between 0 and 3`),
  ],
);
export const detections = pgTable('detections', {
  id: id(),
  inspectionId: uuid('inspection_id')
    .notNull()
    .references(() => inspections.id, { onDelete: 'cascade' }),
  class: text('class').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  box: jsonb('box').notNull(),
  personRef: text('person_ref'),
});
export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    findings: jsonb('findings').notNull(),
    note: text('note').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [index('reviews_inspection_time').on(t.inspectionId, t.createdAt)],
);
export const rules = pgTable(
  'rules',
  {
    id: id(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    metric: text('metric').notNull(),
    threshold: doublePrecision('threshold').notNull(),
    consecutive: integer('consecutive').notNull().default(3),
    hysteresis: doublePrecision('hysteresis').notNull().default(2),
    recoveryReadings: integer('recovery_readings').notNull().default(3),
    severity: text('severity').notNull().default('WARNING'),
    enabled: boolean('enabled').notNull().default(true),
    breachCount: integer('breach_count').notNull().default(0),
    recoveryCount: integer('recovery_count').notNull().default(0),
    conditionActive: boolean('condition_active').notNull().default(false),
  },
  (t) => [uniqueIndex('rules_zone_metric').on(t.zoneId, t.metric)],
);
export const alerts = pgTable(
  'alerts',
  {
    id: id(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    ruleId: uuid('rule_id').references(() => rules.id),
    inspectionId: uuid('inspection_id').references(() => inspections.id),
    conditionKey: text('condition_key').notNull(),
    title: text('title').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('OPEN'),
    conditionActive: boolean('condition_active').notNull().default(true),
    evidence: jsonb('evidence').notNull(),
    openedAt: at('opened_at'),
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionReason: text('resolution_reason'),
  },
  (t) => [
    uniqueIndex('one_active_condition')
      .on(t.zoneId, t.conditionKey)
      .where(sql`${t.conditionActive} = true`),
    index('alerts_zone_status_time').on(t.zoneId, t.status, t.openedAt),
    check(
      'alert_status',
      sql`${t.status} in ('OPEN','ACKNOWLEDGED','RESOLVED')`,
    ),
  ],
);
export const alertActions = pgTable('alert_actions', {
  id: id(),
  alertId: uuid('alert_id')
    .notNull()
    .references(() => alerts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  note: text('note').notNull(),
  override: boolean('override').notNull().default(false),
  createdAt: at('created_at'),
});
