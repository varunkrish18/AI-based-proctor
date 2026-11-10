package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.util.List;

public record RiskTimelineResponse(
        Long attemptId,
        BigDecimal currentRiskScore,
        Boolean flaggedForReview,
        List<WarningResponse> warnings,
        List<RiskPoint> scoreHistory
) {}
