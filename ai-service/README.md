# AI Service (Phase 8 — not yet built)

This directory is reserved for the FastAPI computer-vision service described in
the project spec (Sections 6, 7, 15, 16):

- Face detection & landmarks (OpenCV / MediaPipe)
- Head-pose & gaze estimation
- Multiple-person detection
- Temporal behavior analysis → observable events with confidence scores

Per the phased plan, this is built in Phase 8 after the browser-side event
extraction (Phases 2–3) and the warning engine (Phase 6) exist, since the
AI service's job is to emit the *same* event schema (`FACE_NOT_VISIBLE`,
`MULTIPLE_FACES`, `LOOKING_LEFT`, ...) that the browser-side checks already
produce for simpler signals like tab-switch and fullscreen-exit.

It will expose a REST/WebSocket contract the Spring Boot backend calls,
matching the `ProctoringEvent` shape in `database/schema-notes.md`.
