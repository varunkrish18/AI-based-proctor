-- Phase 19: Track question creator and lock coordinator questions
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(50);
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS created_by_coordinator BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_exam_questions_created_by ON exam_questions (created_by);
CREATE INDEX IF NOT EXISTS idx_exam_questions_created_by_coordinator ON exam_questions (created_by_coordinator);

-- Backfill existing questions on exams created by a Course Coordinator
UPDATE exam_questions q
SET created_by = e.created_by,
    created_by_coordinator = TRUE,
    created_by_role = 'COURSE_COORDINATOR'
FROM exams e
JOIN admins a ON e.created_by = a.id
WHERE q.exam_id = e.id AND a.role = 'COURSE_COORDINATOR';
