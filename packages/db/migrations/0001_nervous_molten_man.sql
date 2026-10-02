ALTER TABLE "zones" ADD COLUMN "helmet_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "vest_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "ppe_alerts_enabled" boolean DEFAULT true NOT NULL;