-- Run once against an existing articles table.
ALTER TABLE articles
  ADD COLUMN tags TEXT NULL AFTER category;

UPDATE articles SET tags = '' WHERE tags IS NULL;

ALTER TABLE articles
  MODIFY COLUMN tags TEXT NOT NULL,
  DROP COLUMN reading_time;
