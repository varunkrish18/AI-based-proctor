package com.proctor.exam.dto;

import jakarta.validation.constraints.Min;
import java.math.BigDecimal;
import java.time.Instant;

public record UpdateExamRequest(
        String name,
        String description,
        String subject,
        @Min(1) Integer durationMinutes,
        Instant startAt,
        Instant endAt,
        @Min(1) Integer numQuestions,
        BigDecimal passingMarks,
        BigDecimal negativeMarking,
        Boolean randomizeQuestions,
        Boolean randomizeOptions,
        @Min(1) Integer maxAttempts,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired,
        Integer audioInputLevel,
        String status
) {}
