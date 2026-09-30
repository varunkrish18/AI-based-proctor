package com.proctor.exam.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record AiGenerateQuestionsRequest(
        @NotBlank(message = "Exam portions / topics must not be blank")
        String topics,

        @Min(value = 1, message = "At least 1 question must be generated")
        @Max(value = 25, message = "At most 25 questions can be generated at once")
        Integer numQuestions,

        String questionType, // "MCQ", "CODING", or "MIXED"

        String difficulty    // "Easy", "Medium", "Hard", "Balanced"
) {}
