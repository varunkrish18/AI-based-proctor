-- Additional indexes for audit logging, reporting queries, and attempt filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_email ON exam_attempts (LOWER(student_email));
CREATE INDEX IF NOT EXISTS idx_exam_attempts_start_time ON exam_attempts (start_time);
