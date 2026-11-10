package com.proctor.exam.dto;

import java.time.Instant;
import java.util.List;

/**
 * Report entry: which questions were randomly assigned to a given student,
 * including access credentials for one-page candidate report generation.
 */
public record StudentQuestionAssignmentEntry(
        String studentEmail,
        String accessPassword,
        List<AssignedQuestionSummary> questions,
        Instant assignedAt
) {
    public StudentQuestionAssignmentEntry(String studentEmail, List<AssignedQuestionSummary> questions, Instant assignedAt) {
        this(studentEmail, null, questions, assignedAt);
    }
}
