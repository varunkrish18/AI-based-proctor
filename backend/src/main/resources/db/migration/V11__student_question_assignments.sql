-- V11: Per-student question assignment table
-- Allows admin to pre-assign a specific subset of exam questions to each student.
-- When a student starts the exam, these pre-assigned questions are served instead of random selection.

CREATE TABLE IF NOT EXISTS student_question_assignments (
    id               BIGSERIAL PRIMARY KEY,
    exam_id          BIGINT       NOT NULL REFERENCES exams(id),
    student_email    VARCHAR(255) NOT NULL,
    question_ids     TEXT         NOT NULL,  -- JSON array of exam_question ids, e.g. [3,7,12]
    questions_per_student INT     NOT NULL DEFAULT 0,
    assigned_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (exam_id, student_email)
);

CREATE INDEX IF NOT EXISTS idx_sqa_exam_id      ON student_question_assignments(exam_id);
CREATE INDEX IF NOT EXISTS idx_sqa_student_email ON student_question_assignments(student_email);
