package com.proctor.exam.dto;

import java.util.List;

public record ProfessorStudentReportResponse(
        Long examId,
        String examName,
        int totalQuestions,
        int coordinatorQuestionsCount,
        int professorQuestionsCount,
        List<ProfessorStudentReportItem> students
) {}
