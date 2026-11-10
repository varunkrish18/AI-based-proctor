package com.proctor.exam.dto;

import java.math.BigDecimal;

public record AdminQuestionAnswerResponse(
        Long questionId,
        Integer displayOrder,
        String questionType,
        String problemTitle,
        String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        Short selectedOption,
        Short correctAnswer,
        Boolean isCorrect,
        BigDecimal marksAwarded,
        BigDecimal maxMarks,
        String codeSubmission,
        String codeLanguage,
        Integer testCasesPassed,
        Integer totalTestCases,
        String executionOutput
) {}
