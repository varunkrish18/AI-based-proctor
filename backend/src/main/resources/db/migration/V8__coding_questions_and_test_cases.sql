-- Phase 10: Coding questions with LeetCode-style test cases and real-time execution

-- 1. Alter exam_questions to support both MCQ and CODING question types
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'MCQ';
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS problem_title VARCHAR(255);
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS code_template TEXT;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS allowed_languages VARCHAR(255) DEFAULT 'python,javascript';
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS constraints TEXT;

-- Relax NOT NULL constraints for MCQ-specific columns to allow CODING questions
ALTER TABLE exam_questions ALTER COLUMN option_a DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN option_b DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN option_d DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN correct_answer DROP NOT NULL;

-- Update check constraint on correct_answer to allow NULL for CODING questions
ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS exam_questions_correct_answer_check;
ALTER TABLE exam_questions ADD CONSTRAINT exam_questions_correct_answer_check
    CHECK (correct_answer IS NULL OR (correct_answer BETWEEN 0 AND 3));

-- 2. Create test cases table for coding questions
CREATE TABLE IF NOT EXISTS exam_question_test_cases (
    id              BIGSERIAL PRIMARY KEY,
    question_id     BIGINT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    input           TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    is_hidden       BOOLEAN NOT NULL DEFAULT false,
    explanation     TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_cases_question_id ON exam_question_test_cases (question_id);

-- 3. Extend exam_answers to store coding submissions, languages, and evaluation results
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS code_submission TEXT;
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS code_language VARCHAR(50);
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS test_cases_passed INTEGER;
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS total_test_cases INTEGER;
ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS execution_output TEXT;
