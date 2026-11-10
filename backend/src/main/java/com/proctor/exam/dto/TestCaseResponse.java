package com.proctor.exam.dto;

public record TestCaseResponse(
        Long id,
        String input,
        String expectedOutput,
        Boolean isHidden,
        String explanation,
        Integer displayOrder
) {}
