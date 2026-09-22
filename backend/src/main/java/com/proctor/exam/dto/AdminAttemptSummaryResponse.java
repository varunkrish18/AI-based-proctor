package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record AdminAttemptSummaryResponse(
        Long attemptId,
        Long examId,
        String studentEmail,
        Integer attemptNumber,
        String status,
        Instant startTime,
        Instant endTime,
        BigDecimal score,
        long totalEvents,
        long infoEvents,
        long lowEvents,
        long mediumEvents,
        long highEvents,
        long criticalEvents,
        BigDecimal currentRiskScore,
        Boolean flaggedForReview,
        ProctoringSessionResponse proctoringSession
) {}
