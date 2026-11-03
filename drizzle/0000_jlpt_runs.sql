CREATE TABLE "jlpt_answers" (
	"run_id" uuid NOT NULL,
	"section" smallint NOT NULL,
	"question_id" text NOT NULL,
	"choice" smallint,
	"correct" boolean NOT NULL,
	CONSTRAINT "jlpt_answers_run_id_question_id_pk" PRIMARY KEY("run_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "jlpt_feedback" (
	"run_id" uuid NOT NULL,
	"section" smallint NOT NULL,
	"rating" text NOT NULL,
	CONSTRAINT "jlpt_feedback_run_id_section_pk" PRIMARY KEY("run_id","section")
);
--> statement-breakpoint
CREATE TABLE "jlpt_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"seed" integer NOT NULL,
	"status" text NOT NULL,
	"section" smallint NOT NULL,
	"section_starts_at" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"break_started_at" timestamp with time zone,
	"results" jsonb NOT NULL,
	"is_public" boolean NOT NULL,
	"nickname" text,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"scores" jsonb,
	"passed" boolean
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "jlpt_answers" ADD CONSTRAINT "jlpt_answers_run_id_jlpt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."jlpt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jlpt_feedback" ADD CONSTRAINT "jlpt_feedback_run_id_jlpt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."jlpt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jlpt_runs_level_finished_idx" ON "jlpt_runs" USING btree ("level","finished_at");--> statement-breakpoint
CREATE INDEX "jlpt_runs_public_finished_idx" ON "jlpt_runs" USING btree ("is_public","finished_at");--> statement-breakpoint
CREATE INDEX "jlpt_runs_expires_idx" ON "jlpt_runs" USING btree ("expires_at");