-- Phase 1 schema: auth, exams, questions, assignments, attempts, answers
-- Later phases (proctoring_sessions, proctoring_events, warnings, audit_logs)
-- will be added as V2__..., V3__... migrations so history stays reproducible.

CREATE TABLE admins (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(30)  NOT NULL DEFAULT 'ADMIN',
    failed_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    full_name   VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_email ON students (email);

CREATE TABLE exams (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    subject             VARCHAR(255),
    duration_minutes    INTEGER NOT NULL,
    start_at            TIMESTAMPTZ NOT NULL,
    end_at              TIMESTAMPTZ NOT NULL,
    num_questions       INTEGER NOT NULL,
    passing_marks       NUMERIC(6,2) NOT NULL DEFAULT 0,
    negative_marking    NUMERIC(4,2) NOT NULL DEFAULT 0,
    randomize_questions BOOLEAN NOT NULL DEFAULT true,
    randomize_options   BOOLEAN NOT NULL DEFAULT true,
    max_attempts        INTEGER NOT NULL DEFAULT 1,
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_by          BIGINT REFERENCES admins(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exams_status ON exams (status);
CREATE INDEX idx_exams_window ON exams (start_at, end_at);

CREATE TABLE exam_questions (
    id              BIGSERIAL PRIMARY KEY,
    exam_id         BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text   TEXT NOT NULL,
    option_a        TEXT NOT NULL,
    option_b        TEXT NOT NULL,
    option_c        TEXT NOT NULL,
    option_d        TEXT NOT NULL,
    correct_answer  SMALLINT NOT NULL CHECK (correct_answer BETWEEN 0 AND 3),
    marks           NUMERIC(6,2) NOT NULL DEFAULT 1,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_questions_exam_id ON exam_questions (exam_id);

CREATE TABLE exam_assignments (
    id              BIGSERIAL PRIMARY KEY,
    exam_id         BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_email   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (exam_id, student_email)
);
CREATE INDEX idx_exam_assignments_email ON exam_assignments (student_email);

CREATE TABLE exam_attempts (
    id              BIGSERIAL PRIMARY KEY,
    exam_id         BIGINT NOT NULL REFERENCES exams(id),
    student_email   VARCHAR(255) NOT NULL,
    attempt_number  INTEGER NOT NULL DEFAULT 1,
    question_order  TEXT,              -- JSON array of exam_question ids, in the order served
    status          VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, SUBMITTED, EXPIRED, TERMINATED
    start_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time        TIMESTAMPTZ,
    score           NUMERIC(8,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_attempts_exam_id ON exam_attempts (exam_id);
CREATE INDEX idx_exam_attempts_email ON exam_attempts (student_email);
CREATE UNIQUE INDEX uq_exam_attempts_exam_email_number ON exam_attempts (exam_id, student_email, attempt_number);

CREATE TABLE exam_answers (
    id                  BIGSERIAL PRIMARY KEY,
    attempt_id          BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id         BIGINT NOT NULL REFERENCES exam_questions(id),
    selected_option     SMALLINT,          -- nullable: unanswered
    is_correct          BOOLEAN,
    marks_awarded       NUMERIC(6,2),
    answered_at         TIMESTAMPTZ,
    UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_exam_answers_attempt_id ON exam_answers (attempt_id);

CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    actor_type  VARCHAR(20) NOT NULL,   -- ADMIN, STUDENT, SYSTEM
    actor_id    VARCHAR(255),
    action      VARCHAR(100) NOT NULL,
    details     TEXT,
    ip_address  VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
