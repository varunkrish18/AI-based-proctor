set PGPASSWORD=exampass
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U examuser -d examdb -c "SELECT installed_rank, version, description, type, script, success FROM flyway_schema_history ORDER BY installed_rank;"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U examuser -d examdb -c "\d exams"
