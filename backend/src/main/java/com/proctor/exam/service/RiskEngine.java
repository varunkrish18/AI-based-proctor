package com.proctor.exam.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proctor.exam.dto.RiskPoint;
import com.proctor.exam.dto.RiskTimelineResponse;
import com.proctor.exam.dto.WarningResponse;
import com.proctor.exam.entity.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.ExamAttemptRepository;
import com.proctor.exam.repository.ProctoringEventRepository;
import com.proctor.exam.repository.WarningRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class RiskEngine {

    private static final Logger log = LoggerFactory.getLogger(RiskEngine.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final WarningRepository warningRepository;
    private final ProctoringEventRepository eventRepository;
    private final ExamAttemptRepository attemptRepository;
    private final AuditLogService auditLogService;

    public RiskEngine(WarningRepository warningRepository,
                      ProctoringEventRepository eventRepository,
                      ExamAttemptRepository attemptRepository,
                      AuditLogService auditLogService) {
        this.warningRepository = warningRepository;
        this.eventRepository = eventRepository;
        this.attemptRepository = attemptRepository;
        this.auditLogService = auditLogService;
    }

    private static final Map<String, Integer> DEFAULT_WEIGHTS = Map.ofEntries(
            Map.entry("TAB_SWITCH", 10),
            Map.entry("WINDOW_BLUR", 10),
            Map.entry("FULLSCREEN_EXIT", 10),
            Map.entry("FACE_NOT_VISIBLE", 15),
            Map.entry("MULTIPLE_FACES", 30),
            Map.entry("LOOKING_LEFT", 10),
            Map.entry("LOOKING_RIGHT", 10),
            Map.entry("LOOKING_UP", 10),
            Map.entry("LOOKING_DOWN", 10),
            Map.entry("LOOKING_AWAY", 10),
            Map.entry("HEAD_TURNED", 15),
            Map.entry("SCREEN_CAPTURE_STOPPED", 30),
            Map.entry("WEBCAM_LOST", 20),
            Map.entry("MICROPHONE_LOST", 15),
            Map.entry("CELL_PHONE_DETECTED", 35),
            Map.entry("PROHIBITED_OBJECT_DETECTED", 25),
            Map.entry("OBJECT_DETECTED", 25),
            Map.entry("PERSON_BEHIND_DETECTED", 30),
            Map.entry("CAMERA_COVERED", 30),
            Map.entry("LOOKING_AWAY_SNAPSHOT", 15),
            Map.entry("VOICE_DETECTED", 20),
            Map.entry("WEBCAM_MUTED", 25),
            Map.entry("CAMERA_CLOSED_AUTO_SUBMIT", 50)
    );

    // Decay constant lambda: half-life/e-fold decay over 600 seconds (10 minutes)
    // At t = 600s, e^(-600/600) = e^(-1) ~= 0.368 (~37%)
    private static final double DECAY_LAMBDA = 1.0 / 600.0;

    /**
     * Single choke point called by ProctoringEventService immediately after an event is saved.
     */
    @Transactional
    public void evaluateRiskOnEvent(ExamAttempt attempt, ProctoringEvent latestEvent) {
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            return;
        }

        Exam exam = attempt.getExam();
        Map<String, Integer> weights = resolveWeights(exam);

        List<ProctoringEvent> allEvents = eventRepository.findByAttemptIdOrderByOccurredAtAsc(attempt.getId());
        BigDecimal currentScore = computeDecayedRiskScore(allEvents, weights, Instant.now());

        long warningCount = warningRepository.countByAttemptId(attempt.getId());
        Optional<Warning> lastWarningOpt = warningRepository.findTopByAttemptIdOrderByCreatedAtDesc(attempt.getId());

        double lastWarningScore = lastWarningOpt.map(w -> w.getRiskScoreAtTime().doubleValue()).orElse(0.0);
        double currentScoreVal = currentScore.doubleValue();

        // Progressive Tier thresholds per specification:
        // Score < 25: Normal (Tier 0)
        // Score 25 - 49: Tier 1 Notice Toast
        // Score 50 - 74: Tier 2 Warning Modal
        // Score >= 75: Tier 3 Flagged / Critical Modal
        int targetTier = 0;
        if (currentScoreVal >= 75.0) {
            targetTier = 3;
        } else if (currentScoreVal >= 50.0) {
            targetTier = 2;
        } else if (currentScoreVal >= 25.0) {
            targetTier = 1;
        }

        int lastTier = lastWarningOpt.map(w -> (int) w.getLevel()).orElse(0);
        boolean shouldWarn = (targetTier > lastTier)
                || (targetTier > 0 && currentScoreVal - lastWarningScore >= 15.0);

        if (shouldWarn && targetTier > 0) {
            String message = generateProgressiveMessage(targetTier, latestEvent);
            Warning warning = Warning.builder()
                    .attempt(attempt)
                    .triggeredByEvent(latestEvent)
                    .level((short) targetTier)
                    .message(message)
                    .riskScoreAtTime(currentScore)
                    .build();

            warningRepository.save(warning);
            log.info("Attempt {}: Issued progressive warning Tier #{} (Risk Score: {})", attempt.getId(), targetTier, currentScore);
        }

        // Check if attempt should be flagged for administrative review
        int maxWarnings = resolveMaxWarnings(exam);
        if ((currentScoreVal >= 75.0 || warningCount >= maxWarnings) && !Boolean.TRUE.equals(attempt.getFlaggedForReview())) {
            attempt.setFlaggedForReview(true);
            attemptRepository.save(attempt);
            auditLogService.logSystem("ATTEMPT_AUTO_FLAGGED",
                    "Attempt ID " + attempt.getId() + " (" + attempt.getStudentEmail() + ") automatically flagged (Risk Score: " + currentScore + ")");
            log.warn("Attempt {}: Flagged for administrative review (non-punitive, score: {})", attempt.getId(), currentScore);
        }
    }

    /**
     * Computes continuous exponential time-decayed risk score:
     * Effective Risk = Σ (event.weight * e^(-λ * Δt))
     * where Δt is elapsed time in seconds, and λ = 1 / 600s.
     */
    public BigDecimal computeDecayedRiskScore(List<ProctoringEvent> events, Map<String, Integer> weights, Instant asOfTime) {
        double total = 0.0;
        for (ProctoringEvent ev : events) {
            if (ev.getOccurredAt().isAfter(asOfTime)) continue;
            long deltaSeconds = Math.max(0, Duration.between(ev.getOccurredAt(), asOfTime).getSeconds());
            double multiplier = Math.exp(-DECAY_LAMBDA * deltaSeconds);

            int weight = weights.getOrDefault(ev.getEventType(), 5);
            total += weight * multiplier;
        }
        return BigDecimal.valueOf(total).setScale(2, RoundingMode.HALF_UP);
    }

    private String generateProgressiveMessage(int level, ProctoringEvent ev) {
        if (ev != null && "CAMERA_COVERED".equals(ev.getEventType())) {
            return "Warning: Your webcam lens appears to be covered or blocked. Keep your camera clear and your face visible.";
        }
        if (ev != null && "FACE_NOT_VISIBLE".equals(ev.getEventType())) {
            return "Warning: Your face is not visible to the camera. Please return to your seat and look directly at the screen.";
        }
        String eventLabel = ev != null ? ev.getEventType().replace("_", " ").toLowerCase() : "unusual activity";
        if (level == 1) {
            return "Notice: Please maintain focus on your test screen and ensure your camera and environment stay clear.";
        } else if (level == 2) {
            return "Warning: Repeated infractions detected (" + eventLabel + "). Continued issues will trigger administrative review.";
        } else {
            return "Caution: Multiple proctoring infractions recorded. This examination session has been flagged for human review.";
        }
    }

    @Transactional(readOnly = true)
    public WarningResponse getLatestWarning(Long attemptId) {
        return warningRepository.findTopByAttemptIdOrderByCreatedAtDesc(attemptId)
                .map(this::toWarningResponse)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public RiskTimelineResponse getRiskTimeline(Long attemptId) {
        ExamAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));

        Exam exam = attempt.getExam();
        Map<String, Integer> weights = resolveWeights(exam);

        List<ProctoringEvent> events = eventRepository.findByAttemptIdOrderByOccurredAtAsc(attemptId);
        List<Warning> warnings = warningRepository.findByAttemptIdOrderByCreatedAtAsc(attemptId);

        BigDecimal currentScore = computeDecayedRiskScore(events, weights, Instant.now());

        // Build history of score points over time
        List<RiskPoint> scoreHistory = new ArrayList<>();
        for (ProctoringEvent ev : events) {
            BigDecimal scoreAtEv = computeDecayedRiskScore(events, weights, ev.getOccurredAt());
            scoreHistory.add(new RiskPoint(ev.getOccurredAt(), scoreAtEv, ev.getEventType(), null));
        }

        List<WarningResponse> warningResponses = warnings.stream().map(this::toWarningResponse).toList();

        return new RiskTimelineResponse(
                attemptId,
                currentScore,
                Boolean.TRUE.equals(attempt.getFlaggedForReview()),
                warningResponses,
                scoreHistory
        );
    }

    private WarningResponse toWarningResponse(Warning w) {
        return new WarningResponse(
                w.getId(),
                w.getAttempt().getId(),
                w.getLevel(),
                w.getMessage(),
                w.getRiskScoreAtTime(),
                w.getCreatedAt()
        );
    }

    public Map<String, Integer> resolveWeights(Exam exam) {
        if (exam.getProctoringConfig() != null && !exam.getProctoringConfig().isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(exam.getProctoringConfig());
                JsonNode weightsNode = root.get("weights");
                if (weightsNode != null && weightsNode.isObject()) {
                    Map<String, Integer> map = new HashMap<>(DEFAULT_WEIGHTS);
                    weightsNode.fieldNames().forEachRemaining(key -> {
                        map.put(key, weightsNode.get(key).asInt(10));
                    });
                    return map;
                }
            } catch (Exception e) {
                log.warn("Could not parse exam proctoringConfig JSON, using default weights: {}", e.getMessage());
            }
        }
        return DEFAULT_WEIGHTS;
    }

    private int resolveMaxWarnings(Exam exam) {
        if (exam.getProctoringConfig() != null && !exam.getProctoringConfig().isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(exam.getProctoringConfig());
                JsonNode maxNode = root.get("maxWarnings");
                if (maxNode != null && maxNode.isInt()) {
                    return maxNode.asInt();
                }
            } catch (Exception ignored) {}
        }
        return 10;
    }
}
