package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Full single-attempt report — the complete picture an admin sees when drilling
 * into a specific attempt. Per spec Section 27: no raw webcam/screen frames;
 * only structured event/score data.
 */
public record AdminAttemptReportResponse(
        // --- Identity ---
        Long attemptId,
        Long examId,
        String studentEmail,
        String studentName,
        int attemptNumber,

        // --- Exam metadata ---
        String examName,
        String examSubject,
        int durationMinutes,

        // --- Scoring & timing ---
        String status,
        Instant startTime,
        Instant endTime,
        BigDecimal score,
        boolean flaggedForReview,

        // --- Risk ---
        BigDecimal currentRiskScore,

        // --- Proctoring detail ---
        List<ProctoringEventResponse> events,
        List<WarningResponse> warnings,
        List<RiskPoint> scoreHistory,

        // --- Aggregated event counts by severity ---
        long totalEvents,
        long infoEvents,
        long lowEvents,
        long mediumEvents,
        long highEvents,
        long criticalEvents
) {}
