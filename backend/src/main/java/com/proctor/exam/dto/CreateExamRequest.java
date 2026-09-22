package com.proctor.exam.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;

public record CreateExamRequest(
        @NotBlank String name,
        String description,
        String subject,
        @NotNull @Min(1) Integer durationMinutes,
        @NotNull Instant startAt,
        @NotNull Instant endAt,
        @NotNull @Min(1) Integer numQuestions,
        @NotNull BigDecimal passingMarks,
        BigDecimal negativeMarking,
        Boolean randomizeQuestions,
        Boolean randomizeOptions,
        @Min(1) Integer maxAttempts,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired
) {}
