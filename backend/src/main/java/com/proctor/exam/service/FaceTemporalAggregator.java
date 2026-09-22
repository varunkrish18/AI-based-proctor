package com.proctor.exam.service;

import com.proctor.exam.dto.AiFrameAnalysisResponse;
import com.proctor.exam.dto.ClientEventItem;
import com.proctor.exam.dto.EventBatchRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FaceTemporalAggregator {

    private static final Logger log = LoggerFactory.getLogger(FaceTemporalAggregator.class);

    private static final Set<String> MODEL_EVENT_TYPES = Set.of(
            "SUSPICIOUS_POSTURE",
            "CELL_PHONE_DETECTED",
            "PROHIBITED_OBJECT_DETECTED",
            "OBJECT_DETECTED",
            "PERSON_BEHIND_DETECTED"
    );

    private final ProctoringEventService eventService;
    private final Map<Long, AttemptCvState> stateByAttempt = new ConcurrentHashMap<>();

    public FaceTemporalAggregator(ProctoringEventService eventService) {
        this.eventService = eventService;
    }

    public static class AttemptCvState {
        public Instant lastFaceSeenAt = Instant.now();
        public boolean faceMissingActive = false;
        public int consecutiveMultiFaceCount = 0;
        public boolean multiFaceEventActive = false;
        public String currentGazeDirection = "CENTER";
        public Instant gazeAwayStartedAt = null;
        public boolean gazeAwayEmitted = false;
        public final List<Instant> recentLookAwayOccurrences = new ArrayList<>();
        public boolean headTurnedActive = false;
        public boolean unavailableNotified = false;
        public final Map<String, Instant> lastModelEventAt = new ConcurrentHashMap<>();
    }

    public void processFrameResult(Long attemptId, String studentEmail, AiFrameAnalysisResponse res, boolean isServiceAvailable) {
        AttemptCvState state = stateByAttempt.computeIfAbsent(attemptId, k -> new AttemptCvState());
        Instant now = Instant.now();

        // 1. Service availability logging
        if (!isServiceAvailable) {
            if (!state.unavailableNotified) {
                state.unavailableNotified = true;
                emitEvent(attemptId, studentEmail, "WEBCAM_ANALYSIS_UNAVAILABLE", BigDecimal.ZERO, "{\"reason\": \"AI service unreachable\"}");
            }
            return;
        }

        // Learned-model findings used to be returned by Python and then discarded.
        // Persist only a distinct allow-listed category, rate-limited per attempt.
        processModelEvents(attemptId, studentEmail, res, state, now);

        // 2. Face Visibility (Phase 4)
        if (!res.faceDetected() || res.faceCount() == 0) {
            long absentSeconds = Duration.between(state.lastFaceSeenAt, now).toSeconds();
            if (absentSeconds >= 5 && !state.faceMissingActive) {
                state.faceMissingActive = true;
                log.info("Attempt {}: Face not visible for {}s, emitting FACE_NOT_VISIBLE", attemptId, absentSeconds);
                emitEvent(attemptId, studentEmail, "FACE_NOT_VISIBLE", BigDecimal.valueOf(absentSeconds), null);
            }
        } else {
            if (state.faceMissingActive) {
                // Face has reappeared
                state.faceMissingActive = false;
            }
            state.lastFaceSeenAt = now;

            // 3. Multi-Face Detection (Phase 4)
            if (res.faceCount() > 1) {
                state.consecutiveMultiFaceCount++;
                if (state.consecutiveMultiFaceCount >= 2 && !state.multiFaceEventActive) {
                    state.multiFaceEventActive = true;
                    log.info("Attempt {}: Multiple faces detected ({}), emitting MULTIPLE_FACES", attemptId, res.faceCount());
                    emitEvent(attemptId, studentEmail, "MULTIPLE_FACES", BigDecimal.valueOf(2.0),
                            String.format("{\"faceCount\": %d}", res.faceCount()));
                }
            } else {
                state.consecutiveMultiFaceCount = 0;
                state.multiFaceEventActive = false;
            }

            // 4. Gaze Direction & Temporal Escalation (Phase 5)
            String gaze = res.gazeDirection() != null ? res.gazeDirection().toUpperCase() : "CENTER";

            if (!"CENTER".equals(gaze)) {
                if (state.gazeAwayStartedAt == null) {
                    state.gazeAwayStartedAt = now;
                    state.currentGazeDirection = gaze;
                    state.gazeAwayEmitted = false;
                } else {
                    long elapsed = Duration.between(state.gazeAwayStartedAt, now).toSeconds();
                    if (elapsed >= 5 && !state.gazeAwayEmitted) {
                        state.gazeAwayEmitted = true;
                        String eventType = "LOOKING_" + gaze;
                        log.info("Attempt {}: Student looking {} for >5s, emitting {}", attemptId, gaze, eventType);
                        emitEvent(attemptId, studentEmail, eventType, BigDecimal.valueOf(elapsed),
                                String.format("{\"direction\": \"%s\", \"duration\": %d, \"continuous\": true}", gaze, elapsed));
                    }
                }
            } else {
                if (state.gazeAwayStartedAt != null) {
                    long elapsed = Duration.between(state.gazeAwayStartedAt, now).toSeconds();
                    if (elapsed >= 2 && !state.gazeAwayEmitted) {
                        String eventType = "LOOKING_" + state.currentGazeDirection;
                        emitEvent(attemptId, studentEmail, eventType, BigDecimal.valueOf(elapsed),
                                String.format("{\"direction\": \"%s\", \"duration\": %d}", state.currentGazeDirection, elapsed));
                    }
                    state.gazeAwayStartedAt = null;
                    state.gazeAwayEmitted = false;
                }
            }

            // 5. Head Pose: distinct head turn (Phase 5)
            if (res.headPose() != null) {
                double absYaw = Math.abs(res.headPose().yaw());
                if (absYaw >= 35.0) {
                    if (!state.headTurnedActive) {
                        state.headTurnedActive = true;
                        emitEvent(attemptId, studentEmail, "HEAD_TURNED", BigDecimal.valueOf(1.0),
                                String.format("{\"yaw\": %.1f, \"pitch\": %.1f}", res.headPose().yaw(), res.headPose().pitch()));
                    }
                } else {
                    state.headTurnedActive = false;
                }
            }
        }
    }

    private void processModelEvents(Long attemptId, String studentEmail, AiFrameAnalysisResponse res,
                                    AttemptCvState state, Instant now) {
        if (res.events() == null) {
            return;
        }
        for (Map<String, Object> event : res.events()) {
            Object rawType = event.get("type");
            if (!(rawType instanceof String type)) {
                continue;
            }
            type = type.toUpperCase();
            if (!MODEL_EVENT_TYPES.contains(type)) {
                continue;
            }
            Instant lastSeen = state.lastModelEventAt.get(type);
            if (lastSeen != null && Duration.between(lastSeen, now).toSeconds() < 5) {
                continue;
            }
            state.lastModelEventAt.put(type, now);
            Object rawConfidence = event.get("confidence");
            String metadata = String.format("{\"source\":\"ai-model\",\"confidence\":%s}",
                    rawConfidence instanceof Number value ? value : "null");
            emitEvent(attemptId, studentEmail, type, BigDecimal.ZERO, metadata);
        }
    }

    private void emitEvent(Long attemptId, String studentEmail, String type, BigDecimal duration, String metadata) {
        ClientEventItem item = new ClientEventItem(type, Instant.now(), duration, metadata);
        eventService.recordEvents(attemptId, studentEmail, new EventBatchRequest(List.of(item)));
    }

    public void clearAttempt(Long attemptId) {
        stateByAttempt.remove(attemptId);
    }
}
