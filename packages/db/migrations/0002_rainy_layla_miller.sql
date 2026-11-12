ALTER TABLE "sessions" DROP CONSTRAINT "session_principal";--> statement-breakpoint
ALTER TABLE "alert_actions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inspections" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "reviewer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "session_principal" CHECK ("sessions"."user_id" is null or "sessions"."share_id" is null);