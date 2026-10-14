-- V12: Add register_number to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS register_number VARCHAR(100);
