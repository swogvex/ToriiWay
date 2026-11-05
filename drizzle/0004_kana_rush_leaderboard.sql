CREATE TABLE "game_names" (
	"name_normalized" text PRIMARY KEY NOT NULL,
	"submitter_hash" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"score_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seed" integer NOT NULL,
	"script" text NOT NULL,
	"difficulty" text NOT NULL,
	"mode" text NOT NULL,
	"server_start" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"submitter_hash" text NOT NULL,
	"script" text NOT NULL,
	"difficulty" text NOT NULL,
	"mode" text NOT NULL,
	"cleared" boolean NOT NULL,
	"duration_s" integer NOT NULL,
	"wpm" double precision NOT NULL,
	"raw_wpm" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"consistency" double precision NOT NULL,
	"popped" integer NOT NULL,
	"missed" integer NOT NULL,
	"series" jsonb NOT NULL,
	"errors" jsonb NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"reports" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_scores_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_score_id_game_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."game_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_name_normalized_game_names_name_normalized_fk" FOREIGN KEY ("name_normalized") REFERENCES "public"."game_names"("name_normalized") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_reports_status_created_idx" ON "game_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "game_reports_score_idx" ON "game_reports" USING btree ("score_id");--> statement-breakpoint
CREATE INDEX "game_runs_server_start_idx" ON "game_runs" USING btree ("server_start");--> statement-breakpoint
CREATE UNIQUE INDEX "game_scores_name_combo_idx" ON "game_scores" USING btree ("name_normalized","script","difficulty","mode");--> statement-breakpoint
CREATE INDEX "game_scores_combo_wpm_idx" ON "game_scores" USING btree ("script","difficulty","mode","status","wpm" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "game_scores_combo_duration_idx" ON "game_scores" USING btree ("script","difficulty","mode","status","duration_s" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "game_scores_status_wpm_idx" ON "game_scores" USING btree ("status","wpm" DESC NULLS LAST);