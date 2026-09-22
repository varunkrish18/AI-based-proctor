package com.proctor.exam.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record QuestionRequest(
        @NotBlank String questionText,
        @NotBlank String optionA,
        @NotBlank String optionB,
        @NotBlank String optionC,
        @NotBlank String optionD,
        @NotNull @Min(0) @Max(3) Short correctAnswer,
        @NotNull BigDecimal marks
) {}
