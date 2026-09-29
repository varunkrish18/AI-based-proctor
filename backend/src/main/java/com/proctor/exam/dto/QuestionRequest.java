package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public record QuestionRequest(
        String questionType,
        @NotBlank String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        Short correctAnswer,
        @NotNull BigDecimal marks,
        String problemTitle,
        String constraints,
        String codeTemplate,
        String allowedLanguages,
        List<TestCaseRequest> testCases
) {}
