package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;

public record OnlineIdeRunRequest(
        @NotBlank String code,
        @NotBlank String language,
        String input
) {}
