package com.proctor.exam.dto;

import java.time.Instant;
import java.util.List;

/**
 * Report entry: which questions were randomly assigned to a given student.
 */
public record StudentQuestionAssignmentEntry(
        String studentEmail,
        List<AssignedQuestionSummary> questions,
        Instant assignedAt
) {}
