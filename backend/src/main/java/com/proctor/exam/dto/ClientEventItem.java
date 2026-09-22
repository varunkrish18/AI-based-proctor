package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;

public record ClientEventItem(
        @NotBlank String eventType,
        @NotNull Instant occurredAt,
        BigDecimal durationSeconds,
        String metadata
) {}
