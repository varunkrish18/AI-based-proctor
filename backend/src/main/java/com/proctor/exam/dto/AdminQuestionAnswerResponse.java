package com.proctor.exam.dto;

import java.math.BigDecimal;

public record AdminQuestionAnswerResponse(
        Long questionId,
        Integer displayOrder,
        String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        Short selectedOption,
        Short correctAnswer,
        Boolean isCorrect,
        BigDecimal marksAwarded,
        BigDecimal maxMarks
) {}
