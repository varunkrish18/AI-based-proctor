package com.proctor.exam.dto;

public record VerifyStudentResponse(
        boolean verified,
        String sessionToken,
        String message,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired,
        String studentName,
        String registerNumber
) {
    public VerifyStudentResponse(boolean verified, String sessionToken, String message) {
        this(verified, sessionToken, message, true, true, true, false, null, null);
    }

    public VerifyStudentResponse(
            boolean verified,
            String sessionToken,
            String message,
            Boolean webcamRequired,
            Boolean microphoneRequired,
            Boolean screenRequired,
            Boolean locationRequired
    ) {
        this(verified, sessionToken, message, webcamRequired, microphoneRequired, screenRequired, locationRequired, null, null);
    }
}
