-- Add access_password column to exam_assignments
ALTER TABLE exam_assignments ADD COLUMN IF NOT EXISTS access_password VARCHAR(64);

-- Populate any existing assignments with a random 8-character access password
UPDATE exam_assignments
SET access_password = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8))
WHERE access_password IS NULL;
