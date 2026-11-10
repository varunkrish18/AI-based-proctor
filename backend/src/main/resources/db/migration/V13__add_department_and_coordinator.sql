-- Phase 13: Add department to admins table and seed Course Coordinator
ALTER TABLE admins ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Update existing sample accounts with initial departments
UPDATE admins SET department = 'Computer Science & Engineering' WHERE email = 'examiner@proctor.com' AND (department IS NULL OR department = '');
UPDATE admins SET department = 'Computer Science & Engineering' WHERE email = 'testexaminer_1904861582@proctor.com' AND (department IS NULL OR department = '');

-- Seed a default Course Coordinator for CSE
INSERT INTO admins (email, password_hash, display_password, full_name, role, department, failed_attempts, created_at, updated_at)
SELECT 
    'coordinator.cse@proctor.com',
    crypt('coord123', gen_salt('bf', 12)),
    'coord123',
    'Prof. Sarah Jenkins (CSE Coordinator)',
    'COURSE_COORDINATOR',
    'Computer Science & Engineering',
    0,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM admins WHERE email = 'coordinator.cse@proctor.com'
);

-- Seed a sample faculty in CSE department
INSERT INTO admins (email, password_hash, display_password, full_name, role, department, failed_attempts, created_at, updated_at)
SELECT 
    'faculty.cse@proctor.com',
    crypt('faculty123', gen_salt('bf', 12)),
    'faculty123',
    'Dr. Alan Turing (CSE Faculty)',
    'FACULTY',
    'Computer Science & Engineering',
    0,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM admins WHERE email = 'faculty.cse@proctor.com'
);

-- Seed a sample faculty in a different department (ECE) to demonstrate department isolation
INSERT INTO admins (email, password_hash, display_password, full_name, role, department, failed_attempts, created_at, updated_at)
SELECT 
    'faculty.ece@proctor.com',
    crypt('faculty123', gen_salt('bf', 12)),
    'faculty123',
    'Dr. Claude Shannon (ECE Faculty)',
    'FACULTY',
    'Electronics & Communication Engineering',
    0,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM admins WHERE email = 'faculty.ece@proctor.com'
);
