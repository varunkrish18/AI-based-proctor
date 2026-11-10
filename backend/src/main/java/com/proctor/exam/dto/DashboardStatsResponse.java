package com.proctor.exam.dto;

public record DashboardStatsResponse(
        long activeExams,
        long totalAttempts,
        long highRiskSessionsFlagged,
        double avgScore
) {}
