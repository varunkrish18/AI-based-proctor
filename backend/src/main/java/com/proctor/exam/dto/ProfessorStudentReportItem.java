package com.proctor.exam.dto;

public record ProfessorStudentReportItem(
        Long studentId,
        String registerNumber,
        String name,
        int totalQuestions,
        int completedQuestions,
        int incompleteQuestions
) {}
