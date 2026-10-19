package com.proctor.exam.dto;

import java.time.Instant;

public record StudentUserResponse(
        Long id,
        String fullName,
        String department,
        String registerNumber,
        String year,
        String email,
        String displayPassword,
        Instant createdAt
) {}
