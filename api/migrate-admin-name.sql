-- Run once against an existing alexore_site database whose users table
-- predates the display_name field.
ALTER TABLE users
  ADD COLUMN display_name VARCHAR(120) NOT NULL DEFAULT '' AFTER username;

UPDATE users
SET display_name = 'Alex Ore'
WHERE role = 'admin';
