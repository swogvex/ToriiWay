CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "data_sources" (
	"name" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"license" text NOT NULL,
	"url" text NOT NULL,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji" (
	"literal" text PRIMARY KEY NOT NULL,
	"grade" smallint,
	"jlpt" smallint,
	"strokes" smallint NOT NULL,
	"freq" smallint,
	"meanings_en" text[] NOT NULL,
	"meanings_es" text[] NOT NULL,
	"on_readings" text[] NOT NULL,
	"kun_readings" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_terms" (
	"literal" text NOT NULL,
	"term" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentences" (
	"id" integer PRIMARY KEY NOT NULL,
	"ja" text NOT NULL,
	"reading" text,
	"en" text,
	"es" text
);
--> statement-breakpoint
CREATE TABLE "word_senses" (
	"word_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"pos" text[] NOT NULL,
	"glosses_en" text[] NOT NULL,
	"glosses_es" text[] NOT NULL,
	CONSTRAINT "word_senses_word_id_position_pk" PRIMARY KEY("word_id","position")
);
--> statement-breakpoint
CREATE TABLE "word_sentences" (
	"word_id" integer NOT NULL,
	"sentence_id" integer NOT NULL,
	CONSTRAINT "word_sentences_word_id_sentence_id_pk" PRIMARY KEY("word_id","sentence_id")
);
--> statement-breakpoint
CREATE TABLE "word_terms" (
	"word_id" integer NOT NULL,
	"term" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" integer PRIMARY KEY NOT NULL,
	"kanji_forms" text[] NOT NULL,
	"readings" text[] NOT NULL,
	"kanji_chars" text[] NOT NULL,
	"common" boolean NOT NULL,
	"jlpt" smallint
);
--> statement-breakpoint
CREATE INDEX "kanji_terms_term_idx" ON "kanji_terms" USING btree ("term" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "kanji_terms_trgm_idx" ON "kanji_terms" USING gin ("term" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "word_terms_term_idx" ON "word_terms" USING btree ("term" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "word_terms_trgm_idx" ON "word_terms" USING gin ("term" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "word_terms_word_idx" ON "word_terms" USING btree ("word_id");--> statement-breakpoint
CREATE INDEX "words_kanji_chars_idx" ON "words" USING gin ("kanji_chars");