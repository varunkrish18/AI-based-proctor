package com.proctor.exam.dto;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record AdminAttemptEvaluationRequest(
        @NotNull(message = "Score/marks cannot be null")
        BigDecimal score,
        String status,
        Boolean flaggedForReview,
        String feedback
) {}
