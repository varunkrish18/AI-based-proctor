package com.proctor.exam.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record VerifyStudentRequest(@NotBlank @Email String email) {}
