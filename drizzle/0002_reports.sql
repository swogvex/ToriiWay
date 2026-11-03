CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"run_id" uuid,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_run_id_jlpt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."jlpt_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");