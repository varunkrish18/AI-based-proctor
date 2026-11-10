package com.proctor.exam.dto;

import java.math.BigDecimal;
import java.util.List;

// Sent to the student during the exam - never includes correctAnswer or hidden test cases.
public record StudentQuestionResponse(
        Long questionId,
        String questionType,
        String problemTitle,
        String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        BigDecimal marks,
        String codeTemplate,
        String allowedLanguages,
        String constraints,
        List<TestCaseResponse> sampleTestCases
) {}
