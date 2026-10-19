package com.proctor.exam.dto;

import java.util.List;

public record BulkProfessorUploadResult(
        int totalProcessed,
        int createdCount,
        int updatedCount,
        List<String> errors,
        List<ProfessorUserResponse> professors
) {}
