package com.proctor.exam.dto;

import jakarta.validation.constraints.Email;

public record UpdateAdminUserRequest(
        @Email(message = "Email must be a valid email address")
        String email,

        String fullName,

        String role,

        String password,

        Boolean resetLock
) {}
