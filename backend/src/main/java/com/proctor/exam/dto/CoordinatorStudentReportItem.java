package com.proctor.exam.dto;

public record CoordinatorStudentReportItem(
        Long studentId,
        String registerNumber,
        String name,
        String profName,
        String department,
        int totalQuestions,
        int completedQuestions,
        int incompleteQuestions
) {}
