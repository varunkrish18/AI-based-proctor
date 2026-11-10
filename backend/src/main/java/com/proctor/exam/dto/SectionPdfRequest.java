package com.proctor.exam.dto;

import java.util.List;

public record SectionPdfRequest(
        String department,
        String sectionName,
        String startRegisterNumber,
        String endRegisterNumber,
        Boolean includePasswords,
        List<Long> studentIds
) {}
