package com.proctor.exam.dto;

/**
 * Top-level dashboard summary figures for the admin dashboard header row.
 */
public record DashboardSummaryResponse(
        long totalExams,
        long activeExams,
        long completedAttempts,
        long studentsCurrentlyWriting,
        long warningsToday,
        long highSeverityEventsToday
) {}
