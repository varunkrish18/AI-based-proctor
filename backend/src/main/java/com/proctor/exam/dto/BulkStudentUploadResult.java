package com.proctor.exam.dto;

import java.util.List;

public record BulkStudentUploadResult(
        int totalProcessed,
        int createdCount,
        int updatedCount,
        List<String> errors,
        List<StudentUserResponse> students
) {}
