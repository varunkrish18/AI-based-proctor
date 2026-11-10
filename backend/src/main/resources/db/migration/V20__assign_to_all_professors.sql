-- Phase 20: Support assigning class to all department professors without cloning
ALTER TABLE exams ADD COLUMN IF NOT EXISTS assigned_to_all_professors BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_exams_assigned_to_all_professors ON exams (assigned_to_all_professors);
