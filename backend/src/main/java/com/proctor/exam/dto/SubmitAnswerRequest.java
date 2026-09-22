package com.proctor.exam.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SubmitAnswerRequest(
        @NotNull Long questionId,
        @Min(0) @Max(3) Short selectedOption // null-safe via boxed Short; client omits field to clear an answer
) {}
