-- Phase 18: Assign professor to class/exam created by Course Coordinator
ALTER TABLE exams ADD COLUMN IF NOT EXISTS assigned_professor_id BIGINT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS assigned_professor_email VARCHAR(255);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS assigned_professor_name VARCHAR(255);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_class BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_exams_assigned_professor_email ON exams (LOWER(assigned_professor_email));
CREATE INDEX IF NOT EXISTS idx_exams_assigned_professor_id ON exams (assigned_professor_id);
CREATE INDEX IF NOT EXISTS idx_exams_is_class ON exams (is_class);
