-- Phase 11: Support displaying and managing user credentials in admin portal
ALTER TABLE admins ADD COLUMN IF NOT EXISTS display_password VARCHAR(255);

-- Update existing default administrator accounts with initial display credentials
UPDATE admins SET display_password = 'admin123' WHERE email = 'admin@proctor.com' AND (display_password IS NULL OR display_password = '');
UPDATE admins SET display_password = 'admin123' WHERE email = 'admin@example.com' AND (display_password IS NULL OR display_password = '');

-- Seed a second administrator user if not already present
INSERT INTO admins (email, password_hash, display_password, full_name, role, failed_attempts, created_at, updated_at)
SELECT 
    'proctor@proctor.com',
    crypt('proctor123', gen_salt('bf', 12)),
    'proctor123',
    'Exam Proctor',
    'ADMIN',
    0,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM admins WHERE email = 'proctor@proctor.com'
);
