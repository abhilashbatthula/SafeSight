CREATE TABLE "alert_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"note" text NOT NULL,
	"override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"rule_id" uuid,
	"inspection_id" uuid,
	"condition_key" text NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"condition_active" boolean DEFAULT true NOT NULL,
	"evidence" jsonb NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recovered_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_reason" text,
	CONSTRAINT "alert_status" CHECK ("alerts"."status" in ('OPEN','ACKNOWLEDGED','RESOLVED'))
);
--> statement-breakpoint
CREATE TABLE "detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"class" text NOT NULL,
	"confidence" double precision NOT NULL,
	"box" jsonb NOT NULL,
	"person_ref" text
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"mode" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"result" jsonb,
	"error" text,
	"image_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_status" CHECK ("inspections"."status" in ('QUEUED','PROCESSING','COMPLETED','FAILED')),
	CONSTRAINT "inspection_mode" CHECK ("inspections"."mode" in ('REAL','DEMO'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_inspection_id_unique" UNIQUE("inspection_id"),
	CONSTRAINT "job_attempts" CHECK ("jobs"."attempts" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "membership_role" CHECK ("memberships"."role" in ('ADMIN','OFFICER','VIEWER'))
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"temperature" double precision NOT NULL,
	"humidity" double precision NOT NULL,
	"aqi" double precision NOT NULL,
	"aqi_scale" text DEFAULT 'SIMULATED_US_AQI' NOT NULL,
	"source" text DEFAULT 'SIMULATOR' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"simulation_run_id" uuid NOT NULL,
	CONSTRAINT "reading_bounds" CHECK ("readings"."humidity" between 0 and 100 and "readings"."aqi" between 0 and 500)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"findings" jsonb NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"threshold" double precision NOT NULL,
	"consecutive" integer DEFAULT 3 NOT NULL,
	"hysteresis" double precision DEFAULT 2 NOT NULL,
	"recovery_readings" integer DEFAULT 3 NOT NULL,
	"severity" text DEFAULT 'WARNING' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"breach_count" integer DEFAULT 0 NOT NULL,
	"recovery_count" integer DEFAULT 0 NOT NULL,
	"condition_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"csrf" text NOT NULL,
	"user_id" uuid,
	"facility_id" uuid NOT NULL,
	"share_id" uuid,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "session_principal" CHECK (("sessions"."user_id" is not null) <> ("sessions"."share_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"zone_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"allow_images" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"scenario" text NOT NULL,
	"running" boolean DEFAULT true NOT NULL,
	"seed" integer NOT NULL,
	"tick" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_actions" ADD CONSTRAINT "alert_actions_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_actions" ADD CONSTRAINT "alert_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detections" ADD CONSTRAINT "detections_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_simulation_run_id_simulation_runs_id_fk" FOREIGN KEY ("simulation_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_share_id_share_links_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_condition" ON "alerts" USING btree ("zone_id","condition_key") WHERE "alerts"."condition_active" = true;--> statement-breakpoint
CREATE INDEX "alerts_zone_status_time" ON "alerts" USING btree ("zone_id","status","opened_at");--> statement-breakpoint
CREATE INDEX "inspections_zone_status" ON "inspections" USING btree ("zone_id","status");--> statement-breakpoint
CREATE INDEX "jobs_status_time" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_unique" ON "memberships" USING btree ("user_id","facility_id");--> statement-breakpoint
CREATE INDEX "readings_zone_time" ON "readings" USING btree ("zone_id","observed_at");--> statement-breakpoint
CREATE INDEX "reviews_inspection_time" ON "reviews" USING btree ("inspection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_zone_metric" ON "rules" USING btree ("zone_id","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_run" ON "simulation_runs" USING btree ("zone_id") WHERE "simulation_runs"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "zone_name" ON "zones" USING btree ("facility_id","name");