package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record WarningResponse(
        Long id,
        Long attemptId,
        Short level,
        String message,
        BigDecimal riskScoreAtTime,
        Instant createdAt
) {}
