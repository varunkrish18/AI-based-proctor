package com.proctor.exam.dto;

public record TestCaseExecutionResult(
        int testCaseIndex,
        String input,
        String expectedOutput,
        String actualOutput,
        boolean passed,
        String status,
        long executionTimeMs,
        String errorMessage
) {}
