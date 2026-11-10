-- Phase 21: Track assigning professor on exam_assignments
ALTER TABLE exam_assignments ADD COLUMN IF NOT EXISTS assigned_by_professor_id BIGINT;
ALTER TABLE exam_assignments ADD COLUMN IF NOT EXISTS assigned_by_professor_name VARCHAR(255);
ALTER TABLE exam_assignments ADD COLUMN IF NOT EXISTS assigned_by_professor_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_exam_assignments_assigned_by_prof_email ON exam_assignments (LOWER(assigned_by_professor_email));

-- Backfill existing assignments from audit_logs
UPDATE exam_assignments ea
SET assigned_by_professor_id = sub.actor_id_num,
    assigned_by_professor_name = sub.full_name,
    assigned_by_professor_email = sub.actor_email
FROM (
    SELECT al.actor_id AS actor_email, p.id AS actor_id_num, p.full_name, al.created_at
    FROM audit_logs al
    JOIN professors p ON LOWER(p.email) = LOWER(al.actor_id)
    WHERE al.action = 'STUDENTS_ASSIGNED'
) sub
WHERE ea.assigned_by_professor_name IS NULL
  AND ea.created_at BETWEEN sub.created_at - INTERVAL '2 seconds' AND sub.created_at + INTERVAL '2 seconds';
