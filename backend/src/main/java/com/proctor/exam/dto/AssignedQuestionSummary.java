package com.proctor.exam.dto;

/**
 * Compact summary of a question as shown in the assignment report.
 */
public record AssignedQuestionSummary(
        Long questionId,
        int displayOrder,
        String questionType,       // "MCQ" or "CODING"
        String questionText,       // First 120 chars for preview
        String problemTitle        // Only for CODING questions; null for MCQ
) {}
