-- Phase 14: Allow duration_minutes, passing_marks, negative_marking, max_attempts to be nullable for coordinator classes/untimed exams
ALTER TABLE exams ALTER COLUMN duration_minutes DROP NOT NULL;
ALTER TABLE exams ALTER COLUMN passing_marks DROP NOT NULL;
ALTER TABLE exams ALTER COLUMN negative_marking DROP NOT NULL;
ALTER TABLE exams ALTER COLUMN max_attempts DROP NOT NULL;
