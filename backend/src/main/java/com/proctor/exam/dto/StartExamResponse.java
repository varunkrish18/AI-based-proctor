package com.proctor.exam.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record StartExamResponse(
        Long attemptId,
        Integer durationMinutes,
        Instant serverStartTime,
        List<StudentQuestionResponse> questions,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired,
        Integer audioInputLevel,
        Map<Long, Integer> savedAnswers,
        Map<Long, SavedCodeAnswer> savedCodingAnswers
) {
    public record SavedCodeAnswer(String code, String language) {}
}

