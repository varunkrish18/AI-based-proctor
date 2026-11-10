package com.proctor.exam.dto;

public record ProctoringDirectSessionRequest(
        Long attemptId,
        Long examId
) {}
