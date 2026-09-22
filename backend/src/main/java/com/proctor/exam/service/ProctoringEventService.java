package com.proctor.exam.service;

import com.proctor.exam.dto.*;
import com.proctor.exam.entity.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
public class ProctoringEventService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ProctoringEventService.class);

    private final ProctoringEventRepository eventRepository;
    private final ProctoringSessionService sessionService;
    private final ExamAttemptRepository attemptRepository;
    private final RiskEngine riskEngine;

    public ProctoringEventService(ProctoringEventRepository eventRepository,
                                  ProctoringSessionService sessionService,
                                  ExamAttemptRepository attemptRepository,
                                  RiskEngine riskEngine) {
        this.eventRepository = eventRepository;
        this.sessionService = sessionService;
        this.attemptRepository = attemptRepository;
        this.riskEngine = riskEngine;
    }

    /**
     * Batch-records browser proctoring events sent by the student client.
     * Evaluates severity strictly server-side based on temporal thresholds and repetition count.
     */
    @Transactional
    public List<ProctoringEventResponse> recordEvents(Long attemptId, String studentEmail, EventBatchRequest batch) {
        ExamAttempt attempt = attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));

        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot record events for finalized attempt.");
        }

        ProctoringSession session = sessionService.openSession(attemptId);
        Exam exam = attempt.getExam();

        List<ProctoringEvent> toSave = new ArrayList<>();

        for (ClientEventItem item : batch.events()) {
            String severity = resolveSeverity(item, attempt.getId(), exam);
            if (severity == null) {
                // Event is below threshold or ignored per spec
                continue;
            }

            ProctoringEvent event = ProctoringEvent.builder()
                    .session(session)
                    .attempt(attempt)
                    .eventType(item.eventType())
                    .severity(severity)
                    .confidence(BigDecimal.ONE)
                    .occurredAt(item.occurredAt())
                    .durationSeconds(item.durationSeconds())
                    .metadata(item.metadata())
                    .build();

            toSave.add(event);
        }

        List<ProctoringEvent> saved = eventRepository.saveAll(toSave);
        saveEvidenceImagesToDisk(attempt.getId(), saved);
        for (ProctoringEvent ev : saved) {
            riskEngine.evaluateRiskOnEvent(attempt, ev);
        }
        return saved.stream().map(this::toResponse).toList();
    }

    private void saveEvidenceImagesToDisk(Long attemptId, List<ProctoringEvent> events) {
        for (ProctoringEvent ev : events) {
            String meta = ev.getMetadata();
            if (meta == null || !meta.contains("\"photo\"")) {
                continue;
            }
            try {
                int photoKeyIdx = meta.indexOf("\"photo\"");
                if (photoKeyIdx == -1) continue;
                int base64Marker = meta.indexOf("base64,", photoKeyIdx);
                if (base64Marker == -1) continue;
                int start = base64Marker + "base64,".length();
                int end = meta.indexOf("\"", start);
                if (end == -1) continue;
                String base64Data = meta.substring(start, end);
                byte[] imgBytes = java.util.Base64.getDecoder().decode(base64Data);

                java.nio.file.Path dir = java.nio.file.Paths.get("evidence", "attempt_" + attemptId);
                java.nio.file.Files.createDirectories(dir);
                String filename = String.format("evidence_event_%d_%s.jpg",
                        ev.getId() != null ? ev.getId() : System.currentTimeMillis(),
                        ev.getEventType().toLowerCase());
                java.nio.file.Path target = dir.resolve(filename);
                java.nio.file.Files.write(target, imgBytes);
                log.info("Saved evidence snapshot to disk: {}", target.toAbsolutePath());
            } catch (Exception e) {
                log.warn("Could not save evidence photo to disk for event #{}: {}", ev.getId(), e.getMessage());
            }
        }
    }

    /**
     * Server-side static severity table (Section 6/8/13).
     * Returns null if the event should be ignored.
     */
    private String resolveSeverity(ClientEventItem item, Long attemptId, Exam exam) {
        String type = item.eventType() != null ? item.eventType().toUpperCase() : "";
        BigDecimal duration = item.durationSeconds();
        double d = duration != null ? duration.doubleValue() : 0.0;

        switch (type) {
            case "TAB_SWITCH":
            case "WINDOW_BLUR": {
                long count = eventRepository.countByAttemptIdAndEventType(attemptId, type);
                if (d > 5.0 || count >= 2) {
                    return "MEDIUM";
                }
                return "LOW";
            }

            case "FULLSCREEN_EXIT": {
                // always MEDIUM (first 2), HIGH if it's the 3rd+ exit
                long count = eventRepository.countByAttemptIdAndEventType(attemptId, "FULLSCREEN_EXIT");
                if (count < 2) {
                    return "MEDIUM";
                }
                return "HIGH";
            }

            case "SCREEN_CAPTURE_STOPPED":
                // Stopping active screen capture is a high-severity infraction
                return "HIGH";

            case "WEBCAM_LOST":
            case "MICROPHONE_LOST": {
                // <3s ignore, 3–10s LOW, >10s MEDIUM
                if (duration != null && d < 3.0) {
                    return null;
                }
                if (duration != null && d <= 10.0) {
                    return "LOW";
                }
                return "MEDIUM";
            }

            case "CONNECTION_LOST": {
                if (duration != null && d < 3.0) {
                    return null;
                }
                return duration != null && d > 15.0 ? "MEDIUM" : "LOW";
            }

            case "LOCATION_DENIED": {
                // INFO only if exam requires location, else don't even log it
                if (Boolean.TRUE.equals(exam.getLocationRequired())) {
                    return "INFO";
                }
                return null;
            }

            case "FACE_NOT_VISIBLE":
                return "MEDIUM";

            case "MULTIPLE_FACES":
                return "HIGH";

            case "LOOKING_LEFT":
            case "LOOKING_RIGHT":
            case "LOOKING_UP":
            case "LOOKING_DOWN": {
                long count = eventRepository.countByAttemptIdAndEventType(attemptId, type);
                return count >= 3 ? "MEDIUM" : "LOW";
            }

            case "HEAD_TURNED":
                return "MEDIUM";

            case "CELL_PHONE_DETECTED":
                return "CRITICAL";

            case "PROHIBITED_OBJECT_DETECTED":
            case "OBJECT_DETECTED":
                return "HIGH";

            case "PERSON_BEHIND_DETECTED":
                return "HIGH";

            case "LOOKING_AWAY_SNAPSHOT":
                return "MEDIUM";

            case "VOICE_DETECTED":
                return "MEDIUM";

            case "WEBCAM_ANALYSIS_UNAVAILABLE":
                return "INFO";

            default:
                return "INFO";
        }
    }

    @Transactional(readOnly = true)
    public List<AdminAttemptSummaryResponse> getAttemptsWithEventSummary(Long examId) {
        return getAttemptsWithEventSummary(examId, null, null, null, null, null);
    }

    @Transactional(readOnly = true)
    public List<AdminAttemptSummaryResponse> getAttemptsWithEventSummary(
            Long examId,
            String studentEmail,
            String severity,
            String eventType,
            Instant from,
            Instant to
    ) {
        org.springframework.data.jpa.domain.Specification<ExamAttempt> spec =
                com.proctor.exam.repository.ExamAttemptSpecification.filter(examId, studentEmail, severity, eventType, from, to);
        List<ExamAttempt> attempts = attemptRepository.findAll(spec);
        List<AdminAttemptSummaryResponse> results = new ArrayList<>();

        for (ExamAttempt a : attempts) {
            List<Object[]> counts = eventRepository.countSeveritiesByAttemptId(a.getId());
            Map<String, Long> severityCounts = new HashMap<>();
            long total = 0;
            for (Object[] row : counts) {
                String sev = (String) row[0];
                Long c = (Long) row[1];
                severityCounts.put(sev, c);
                total += c;
            }

            ProctoringSessionResponse sessionResp = sessionService.findSessionResponse(a.getId()).orElse(null);

            List<ProctoringEvent> allEvents = eventRepository.findByAttemptIdOrderByOccurredAtAsc(a.getId());
            Map<String, Integer> weights = riskEngine.resolveWeights(a.getExam());
            BigDecimal currentScore = riskEngine.computeDecayedRiskScore(allEvents, weights, Instant.now());
            Boolean flagged = Boolean.TRUE.equals(a.getFlaggedForReview());

            results.add(new AdminAttemptSummaryResponse(
                    a.getId(),
                    examId,
                    a.getStudentEmail(),
                    a.getAttemptNumber(),
                    a.getStatus(),
                    a.getStartTime(),
                    a.getEndTime(),
                    a.getScore(),
                    total,
                    severityCounts.getOrDefault("INFO", 0L),
                    severityCounts.getOrDefault("LOW", 0L),
                    severityCounts.getOrDefault("MEDIUM", 0L),
                    severityCounts.getOrDefault("HIGH", 0L),
                    severityCounts.getOrDefault("CRITICAL", 0L),
                    currentScore,
                    flagged,
                    sessionResp
            ));
        }

        return results;
    }

    @Transactional(readOnly = true)
    public List<ProctoringEventResponse> getEventsForAttempt(Long attemptId, String severity, String type) {
        attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));

        String s = (severity != null && !severity.isBlank()) ? severity.toUpperCase() : null;
        String t = (type != null && !type.isBlank()) ? type.toUpperCase() : null;

        List<ProctoringEvent> events = eventRepository.findByAttemptIdFiltered(attemptId, s, t);
        return events.stream().map(this::toResponse).toList();
    }

    private ProctoringEventResponse toResponse(ProctoringEvent e) {
        return new ProctoringEventResponse(
                e.getId(),
                e.getAttempt().getId(),
                e.getEventType(),
                e.getSeverity(),
                e.getConfidence(),
                e.getOccurredAt(),
                e.getDurationSeconds(),
                e.getMetadata(),
                e.getCreatedAt()
        );
    }
}
