package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record ProctoringEventResponse(
        Long id,
        Long attemptId,
        String eventType,
        String severity,
        BigDecimal confidence,
        Instant occurredAt,
        BigDecimal durationSeconds,
        String metadata,
        Instant createdAt
) {}
