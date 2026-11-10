package com.proctor.exam.dto;

import java.time.Instant;

/**
 * Real-time heartbeat/sync response returned to active student examination screens,
 * allowing live updates to timers and immediate termination when examiner updates timing.
 */
public record ExamLiveSyncResponse(
        Long examId,
        Long attemptId,
        String examStatus,
        boolean isTerminated,
        long remainingSeconds,
        Integer durationMinutes,
        Instant endAt,
        String message
) {}
