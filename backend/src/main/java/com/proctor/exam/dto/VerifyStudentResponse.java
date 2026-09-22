package com.proctor.exam.dto;

public record VerifyStudentResponse(boolean verified, String sessionToken, String message) {}
