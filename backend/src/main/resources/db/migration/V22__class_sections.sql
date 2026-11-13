-- Phase 22: Persistent class sections registry across all devices
CREATE TABLE IF NOT EXISTS class_sections (
    id VARCHAR(64) PRIMARY KEY,
    class_name VARCHAR(120) NOT NULL,
    department VARCHAR(255),
    year VARCHAR(64),
    start_reg VARCHAR(64),
    end_reg VARCHAR(64),
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_sections_display_order ON class_sections (display_order);

