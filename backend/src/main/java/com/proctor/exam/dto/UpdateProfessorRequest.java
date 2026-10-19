package com.proctor.exam.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record UpdateProfessorRequest(
        @NotBlank(message = "Name is required")
        String fullName,

        String department,

        @NotBlank(message = "Staff code is required")
        String staffCode,

        String year,

        @NotBlank(message = "Mail address is required")
        @Email(message = "Must be a valid email address")
        String email,

        String password
) {}
