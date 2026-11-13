package com.proctor.exam.dto;

import java.util.List;

public record UnifiedAuthResponse(
        String accessToken,
        String refreshToken,
        String role,
        String email,
        String fullName,
        String department,
        String identifier,
        boolean mustResetPassword,
        long expiresInSeconds,
        List<String> availableRoles
) {
    public UnifiedAuthResponse(
            String accessToken,
            String refreshToken,
            String role,
            String email,
            String fullName,
            String department,
            String identifier,
            boolean mustResetPassword,
            long expiresInSeconds
    ) {
        this(accessToken, refreshToken, role, email, fullName, department, identifier, mustResetPassword, expiresInSeconds, role != null ? List.of(role) : List.of());
    }
}

