# Database

Phase 1 schema lives in `backend/src/main/resources/db/migration/V1__init_schema.sql`
and is applied automatically by Flyway on backend startup. It covers:

`admins`, `students`, `exams`, `exam_questions`, `exam_assignments`,
`exam_attempts`, `exam_answers`, `audit_logs`.

## Tables planned for later phases (not yet created)

Add these as `V2__...sql`, `V3__...sql` etc. so migration history stays
reproducible — never edit `V1` after it has run anywhere real:

- `proctoring_sessions` — one per exam attempt; tracks webcam/mic/screen
  connection state (Phase 2).
- `proctoring_events` — the event stream described in spec Section 13
  (`eventId, studentId, examId, sessionId, eventType, timestamp, duration,
  severity, confidence, metadata`) (Phase 3–5).
- `warnings` — progressive warnings shown to the student, derived from
  `proctoring_events` by the rule engine (Phase 6).

## Bootstrapping the first admin

There's deliberately no seeded admin account (the spec explicitly says not to
hard-code credentials). Create one by inserting a BCrypt hash directly:

```bash
# Generate a BCrypt hash for your chosen password (cost factor 12, matching
# SecurityConfig's BCryptPasswordEncoder(12)):
python3 -c "import bcrypt; print(bcrypt.hashpw(b'YOUR_PASSWORD', bcrypt.gensalt(12)).decode())"
```

```sql
INSERT INTO admins (email, password_hash, full_name, role)
VALUES ('admin@yourinstitution.edu', '<paste the hash above>', 'Admin Name', 'ADMIN');
```

(`pip install bcrypt` first if it isn't installed.)
