package com.proctor.exam.dto;

import java.time.Instant;

public record AdminUserResponse(
        Long id,
        String email,
        String fullName,
        String role,
        String displayPassword,
        Integer failedAttempts,
        boolean locked,
        Instant lockedUntil,
        Instant createdAt,
        Instant updatedAt
) {}
