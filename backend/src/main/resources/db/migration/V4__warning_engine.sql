-- V4__warning_engine.sql: Configurable proctoring thresholds, warnings log, and review flagging

-- 1. Exam-level configurable proctoring thresholds and event weights (Section 34)
ALTER TABLE exams ADD COLUMN proctoring_config JSONB NOT NULL DEFAULT '{
  "faceMissingSeconds": 5,
  "multiFaceMinConsecutive": 2,
  "lookAwayLowSeconds": 2,
  "lookAwayMediumSeconds": 5,
  "lookAwayRepeatWindowSeconds": 120,
  "lookAwayRepeatThreshold": 3,
  "tabSwitchLowSeconds": 2,
  "tabSwitchMediumSeconds": 5,
  "maxWarnings": 10,
  "autoActionOnMaxWarnings": "FLAG_FOR_REVIEW",
  "weights": {
    "TAB_SWITCH": 10,
    "FULLSCREEN_EXIT": 10,
    "FACE_NOT_VISIBLE": 15,
    "MULTIPLE_FACES": 30,
    "LOOKING_LEFT": 10,
    "LOOKING_RIGHT": 10,
    "LOOKING_UP": 10,
    "LOOKING_DOWN": 10,
    "HEAD_TURNED": 15,
    "SCREEN_CAPTURE_STOPPED": 30,
    "WEBCAM_LOST": 20,
    "MICROPHONE_LOST": 15
  }
}'::jsonb;

-- 2. Human review flag on attempts (non-punitive per Section 14)
ALTER TABLE exam_attempts ADD COLUMN flagged_for_review BOOLEAN NOT NULL DEFAULT false;

-- 3. Warnings table for progressive tiered student notices
CREATE TABLE warnings (
    id                    BIGSERIAL PRIMARY KEY,
    attempt_id           BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    triggered_by_event_id BIGINT REFERENCES proctoring_events(id),
    level                SMALLINT NOT NULL,   -- 1st, 2nd, 3rd progressive warning tier
    message              TEXT NOT NULL,
    risk_score_at_time   NUMERIC(6,2) NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warnings_attempt ON warnings (attempt_id);
