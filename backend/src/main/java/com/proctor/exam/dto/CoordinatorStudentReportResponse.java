package com.proctor.exam.dto;

import java.util.List;

public record CoordinatorStudentReportResponse(
        Long examId,
        String examName,
        int totalCoordinatorQuestions,
        List<CoordinatorStudentReportItem> students
) {}
