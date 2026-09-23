package com.proctor.exam.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;

public record RiskPoint(
        Instant timestamp,
        BigDecimal riskScore,
        String eventType,
        Integer warningLevel
) {
    @JsonProperty("score")
    public BigDecimal score() {
        return riskScore;
    }
}
