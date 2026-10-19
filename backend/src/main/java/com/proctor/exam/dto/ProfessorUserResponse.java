package com.proctor.exam.dto;

import java.time.Instant;

public record ProfessorUserResponse(
        Long id,
        String fullName,
        String department,
        String staffCode,
        String year,
        String email,
        String displayPassword,
        Instant createdAt
) {}
