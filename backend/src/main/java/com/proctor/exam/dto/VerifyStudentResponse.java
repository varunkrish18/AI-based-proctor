package com.proctor.exam.dto;

public record VerifyStudentResponse(
        boolean verified,
        String sessionToken,
        String message,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired
) {
    public VerifyStudentResponse(boolean verified, String sessionToken, String message) {
        this(verified, sessionToken, message, true, true, true, false);
    }
}
