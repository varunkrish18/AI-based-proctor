package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record RiskPoint(
        Instant timestamp,
        BigDecimal riskScore,
        String eventType,
        Integer warningLevel
) {}
