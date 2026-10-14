package com.proctor.exam.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record VerifyStudentRequest(
        @NotBlank @Email String email,
        String password,
        String name,
        String registerNumber
) {
    public VerifyStudentRequest(String email) {
        this(email, null, null, null);
    }

    public VerifyStudentRequest(String email, String password) {
        this(email, password, null, null);
    }
}
