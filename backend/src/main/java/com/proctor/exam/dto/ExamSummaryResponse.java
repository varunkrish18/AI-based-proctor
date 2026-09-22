package com.proctor.exam.dto;

import java.time.Instant;

public record ExamSummaryResponse(
        Long id,
        String name,
        String subject,
        Integer numQuestions,
        Integer durationMinutes,
        Instant startAt,
        Instant endAt,
        String status
) {}
