-- V3__proctoring_events.sql: Proctoring event log and temporal audit records

CREATE TABLE proctoring_events (
    id               BIGSERIAL PRIMARY KEY,
    session_id       BIGINT NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
    attempt_id       BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    event_type       VARCHAR(50) NOT NULL,   -- TAB_SWITCH, FULLSCREEN_EXIT, SCREEN_CAPTURE_STOPPED,
                                             -- WEBCAM_LOST, MICROPHONE_LOST, LOCATION_DENIED, ...
    severity         VARCHAR(20) NOT NULL,   -- INFO, LOW, MEDIUM, HIGH, CRITICAL
    confidence       NUMERIC(4,3) NOT NULL DEFAULT 1.0, -- browser-sourced events are deterministic; CV events (later) won't be
    occurred_at      TIMESTAMPTZ NOT NULL,
    duration_seconds NUMERIC(8,2),
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proctoring_events_attempt ON proctoring_events (attempt_id);
CREATE INDEX idx_proctoring_events_type ON proctoring_events (event_type);
CREATE INDEX idx_proctoring_events_occurred_at ON proctoring_events (occurred_at);
