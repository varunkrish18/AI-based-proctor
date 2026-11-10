package com.proctor.exam.dto;

import java.math.BigDecimal;

/**
 * Compact summary of a question as shown in the assignment report.
 */
public record AssignedQuestionSummary(
        Long questionId,
        int displayOrder,
        String questionType,       // "MCQ" or "CODING"
        String questionText,       // First 120 chars for preview
        String problemTitle,       // Only for CODING questions; null for MCQ
        BigDecimal marks
) {
    public AssignedQuestionSummary(Long questionId, int displayOrder, String questionType, String questionText, String problemTitle) {
        this(questionId, displayOrder, questionType, questionText, problemTitle, BigDecimal.ONE);
    }
}
