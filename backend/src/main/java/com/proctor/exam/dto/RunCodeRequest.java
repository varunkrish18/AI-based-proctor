package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record RunCodeRequest(
        @NotNull Long questionId,
        @NotBlank String code,
        @NotBlank String language,
        String customInput
) {}
