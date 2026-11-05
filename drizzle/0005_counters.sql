CREATE TABLE "counters" (
	"key" text NOT NULL,
	"day" date NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "counters_key_day_pk" PRIMARY KEY("key","day")
);
