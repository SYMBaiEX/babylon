-- Questions can exist before their lazily created prediction market.
ALTER TABLE "Question" ADD COLUMN "marketId" text;
--> statement-breakpoint
ALTER TABLE "Question" ADD CONSTRAINT "Question_marketId_Market_id_fk"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "Question_marketId_idx" ON "Question" ("marketId");
--> statement-breakpoint
-- Current creation paths use the question ID as the market ID. Prefer this
-- authoritative association even when either copy of the text was edited.
UPDATE "Question" q SET "marketId" = m.id
FROM "Market" m WHERE m.id = q.id;
--> statement-breakpoint
-- Legacy rows may have distinct IDs. Only backfill unambiguous text matches;
-- duplicate wording must never arbitrarily associate a question with a market.
WITH candidates AS (
  SELECT q.id AS question_id, m.id AS market_id,
    count(*) OVER (PARTITION BY q.id) AS question_matches,
    count(*) OVER (PARTITION BY m.id) AS market_matches
  FROM "Question" q
  JOIN "Market" m ON lower(trim(m.question)) = lower(trim(q.text))
  WHERE q."marketId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "Question" linked WHERE linked."marketId" = m.id)
)
UPDATE "Question" q SET "marketId" = c.market_id
FROM candidates c
WHERE q.id = c.question_id AND c.question_matches = 1 AND c.market_matches = 1;
--> statement-breakpoint
-- Repair missing legacy display text using the now-authoritative association.
UPDATE "Market" m SET question = q.text
FROM "Question" q
WHERE q."marketId" = m.id AND trim(m.question) = '';
