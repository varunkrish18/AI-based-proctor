-- Phase 15: Add department, year, display_password, and password_hash to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS year VARCHAR(50);
ALTER TABLE students ADD COLUMN IF NOT EXISTS display_password VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Update existing students with initial sample data and passwords so they appear nicely populated
UPDATE students 
SET department = 'Computer Science & Engineering',
    year = '3rd Year',
    display_password = 'student123',
    register_number = COALESCE(register_number, '21CS101'),
    full_name = COALESCE(full_name, 'Aarav Sharma')
WHERE email = 'student1@gmail.com';

UPDATE students 
SET department = 'Information Technology',
    year = '3rd Year',
    display_password = 'student123',
    register_number = COALESCE(register_number, '21IT102'),
    full_name = COALESCE(full_name, 'Bhavya Patel')
WHERE email = 'student2@gmail.com';

UPDATE students 
SET department = 'Electronics & Communication Engineering',
    year = '2nd Year',
    display_password = 'student123',
    register_number = COALESCE(register_number, '22EC103'),
    full_name = COALESCE(full_name, 'Chirag Reddy')
WHERE email = 'student3@gmail.com';

UPDATE students 
SET department = 'Artificial Intelligence & Data Science',
    year = '1st Year',
    display_password = 'student123',
    register_number = COALESCE(register_number, '23AD104'),
    full_name = COALESCE(full_name, 'Divya Krishnan')
WHERE email = 'student4@gmail.com';

UPDATE students 
SET department = 'Computer Science & Engineering',
    year = '4th Year',
    display_password = 'student123',
    register_number = COALESCE(register_number, '20CS105'),
    full_name = COALESCE(full_name, 'Varun Krishna')
WHERE email = 'varunkrishnakumar18@gmail.com';

-- Ensure any other students have default department, year, register_number, and display_password
UPDATE students
SET department = 'Computer Science & Engineering'
WHERE department IS NULL OR department = '';

UPDATE students
SET year = '3rd Year'
WHERE year IS NULL OR year = '';

UPDATE students
SET display_password = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8))
WHERE display_password IS NULL OR display_password = '';

UPDATE students
SET full_name = INITCAP(SPLIT_PART(email, '@', 1))
WHERE full_name IS NULL OR full_name = '';

UPDATE students
SET register_number = 'REG' || LPAD(id::TEXT, 4, '0')
WHERE register_number IS NULL OR register_number = '';
