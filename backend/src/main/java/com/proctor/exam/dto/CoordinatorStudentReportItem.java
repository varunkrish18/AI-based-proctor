package com.proctor.exam.dto;

public record CoordinatorStudentReportItem(
        Long studentId,
        String registerNumber,
        String name,
        String profName,
        String department,
        int totalQuestions,
        int completedQuestions,
        int incompleteQuestions,
        String studentEmail,
        Long attemptId,
        String attemptStatus,
        int warningStrikes,
        boolean isTerminated
) {
    public CoordinatorStudentReportItem(Long studentId, String registerNumber, String name, String profName, String department, int totalQuestions, int completedQuestions, int incompleteQuestions) {
        this(studentId, registerNumber, name, profName, department, totalQuestions, completedQuestions, incompleteQuestions, null, null, null, 0, false);
    }
}
