package com.proctor.exam.dto;

public record UnifiedAuthResponse(
        String accessToken,
        String refreshToken,
        String role,
        String email,
        String fullName,
        String department,
        String identifier,
        boolean mustResetPassword,
        long expiresInSeconds
) {}
