-- V2__proctoring_sessions.sql: Proctoring session state tracking and exam requirement flags

CREATE TABLE proctoring_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    attempt_id          BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    webcam_required     BOOLEAN NOT NULL DEFAULT true,
    microphone_required BOOLEAN NOT NULL DEFAULT true,
    screen_required     BOOLEAN NOT NULL DEFAULT true,
    location_required   BOOLEAN NOT NULL DEFAULT false,
    webcam_status       VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN', -- ACTIVE, LOST, DENIED, UNKNOWN
    microphone_status   VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    screen_status       VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    connection_status   VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN', -- ONLINE, RECONNECTING, OFFLINE
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_heartbeat_at   TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_proctoring_sessions_attempt ON proctoring_sessions (attempt_id);

-- Exam-level requirement flags (admin-configurable per Section 34)
ALTER TABLE exams
    ADD COLUMN webcam_required     BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN microphone_required BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN screen_required     BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN location_required   BOOLEAN NOT NULL DEFAULT false;
