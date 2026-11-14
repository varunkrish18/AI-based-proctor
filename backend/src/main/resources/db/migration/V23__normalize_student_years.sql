-- Normalize student academic year values to standard Title Case (1st Year, 2nd Year, 3rd Year, 4th Year)
UPDATE students
SET year = CASE
    WHEN UPPER(year) LIKE '%4%' OR UPPER(year) LIKE '%IV%' OR UPPER(year) LIKE '%FOURTH%' THEN '4th Year'
    WHEN UPPER(year) LIKE '%3%' OR UPPER(year) LIKE '%III%' OR UPPER(year) LIKE '%THIRD%' THEN '3rd Year'
    WHEN UPPER(year) LIKE '%2%' OR UPPER(year) LIKE '%II%' OR UPPER(year) LIKE '%SECOND%' THEN '2nd Year'
    WHEN UPPER(year) LIKE '%1%' OR UPPER(year) LIKE '%I%' OR UPPER(year) LIKE '%FIRST%' THEN '1st Year'
    ELSE TRIM(year)
END
WHERE year IS NOT NULL AND TRIM(year) <> '';

