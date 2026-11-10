package com.proctor.exam.dto;

import java.util.List;

/**
 * Full question-assignment report for an exam.
 */
public record QuestionAssignmentReportResponse(
        Long examId,
        String examName,
        int totalQuestions,
        int questionsPerStudent,
        int totalStudents,
        List<StudentQuestionAssignmentEntry> assignments
) {}
