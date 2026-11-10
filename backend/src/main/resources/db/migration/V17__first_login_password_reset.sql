-- Phase 17: Add must_reset_password flag to admins, professors, and students
ALTER TABLE admins ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE professors ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT TRUE;

-- Pre-seed default system administrator account with must_reset_password = false so root admin doesn't require immediate reset
UPDATE admins 
SET must_reset_password = FALSE 
WHERE email IN ('admin@example.com', 'admin@proctor.com');

-- For all newly created or existing accounts, must_reset_password remains TRUE until they change it upon first login
