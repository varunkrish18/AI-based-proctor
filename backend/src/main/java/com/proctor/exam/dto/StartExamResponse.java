package com.proctor.exam.dto;

import java.time.Instant;
import java.util.List;

public record StartExamResponse(
        Long attemptId,
        Integer durationMinutes,
        Instant serverStartTime,
        List<StudentQuestionResponse> questions,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired
) {}
