package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record AdminTestRunRequest(
        @NotBlank String code,
        @NotBlank String language,
        List<TestCaseRequest> testCases
) {}
