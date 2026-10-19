-- Phase 16: Create professors table for professor credentials, staff codes, departments, and login credentials
CREATE TABLE IF NOT EXISTS professors (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    staff_code VARCHAR(100),
    year VARCHAR(50),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_password VARCHAR(100),
    password_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_professors_email ON professors (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_professors_staff_code ON professors (LOWER(staff_code));
CREATE INDEX IF NOT EXISTS idx_professors_department ON professors (department);

-- Seed initial representative professors
INSERT INTO professors (full_name, department, staff_code, year, email, display_password, password_hash)
VALUES 
('Dr. Ramesh Sundaram', 'Computer Science & Engineering', 'PROF-CS-01', '3rd Year', 'ramesh.cs@college.edu', 'profPass123', crypt('profPass123', gen_salt('bf', 10))),
('Dr. Ananya Sharma', 'Information Technology', 'PROF-IT-02', '3rd Year', 'ananya.it@college.edu', 'profPass123', crypt('profPass123', gen_salt('bf', 10))),
('Dr. Karthik Raman', 'Electronics & Communication Engineering', 'PROF-EC-03', '2nd Year', 'karthik.ec@college.edu', 'profPass123', crypt('profPass123', gen_salt('bf', 10))),
('Dr. Meenakshi Sundar', 'Artificial Intelligence & Data Science', 'PROF-AD-04', '1st Year', 'meenakshi.ad@college.edu', 'profPass123', crypt('profPass123', gen_salt('bf', 10))),
('Dr. Rajesh Kumar', 'Mechanical Engineering', 'PROF-ME-05', '4th Year', 'rajesh.me@college.edu', 'profPass123', crypt('profPass123', gen_salt('bf', 10)))
ON CONFLICT (email) DO NOTHING;

-- Mirror seeded professors into admins table with role PROFESSOR so they can also sign in
INSERT INTO admins (email, password_hash, display_password, full_name, role, department, failed_attempts, created_at, updated_at)
SELECT 
    p.email,
    p.password_hash,
    p.display_password,
    p.full_name,
    'PROFESSOR',
    p.department,
    0,
    p.created_at,
    p.updated_at
FROM professors p
WHERE NOT EXISTS (
    SELECT 1 FROM admins a WHERE LOWER(a.email) = LOWER(p.email)
);
