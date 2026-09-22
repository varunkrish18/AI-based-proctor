package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record ProctoringDirectEventRequest(
        Long attemptId,
        String eventType,
        Instant occurredAt,
        BigDecimal durationSeconds,
        String metadata,
        List<ClientEventItem> events
) {}
