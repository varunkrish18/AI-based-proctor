package com.proctor.exam.dto;

import java.util.List;

public record RunCodeResponse(
        String status,
        int totalCases,
        int passedCases,
        long executionTimeMs,
        List<TestCaseExecutionResult> results
) {}
