package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;

public record UnifiedLoginRequest(
        @NotBlank(message = "Identifier (email, staff code, or register number) is required")
        String identifier,

        @NotBlank(message = "Password is required")
        String password
) {}
