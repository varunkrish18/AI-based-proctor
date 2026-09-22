package com.proctor.exam.dto;

public record AuthResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresInSeconds
) {
    public AuthResponse(String accessToken, long expiresInSeconds) {
        this(accessToken, null, "Bearer", expiresInSeconds);
    }

    public AuthResponse(String accessToken, String refreshToken, long expiresInSeconds) {
        this(accessToken, refreshToken, "Bearer", expiresInSeconds);
    }
}
