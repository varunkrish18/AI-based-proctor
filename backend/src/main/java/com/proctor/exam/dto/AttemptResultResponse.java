package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record AttemptResultResponse(
        Long attemptId,
        String status,
        Instant startTime,
        Instant endTime,
        BigDecimal score,
        Integer totalQuestions,
        Integer answeredQuestions,
        // Per-question correction data shown to student after submission
        List<QuestionResult> questionResults
) {
    public record QuestionResult(
            Long questionId,
            String questionText,
            String optionA,
            String optionB,
            String optionC,
            String optionD,
            Short selectedOption,   // what the student picked (null = not answered)
            Short correctAnswer,    // the right answer index (0=A,1=B,2=C,3=D)
            Boolean isCorrect,      // null if not answered
            BigDecimal marksAwarded
    ) {}
}
