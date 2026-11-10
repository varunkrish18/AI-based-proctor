package com.proctor.exam.dto;

public record TestCaseRequest(
        Long id,
        String input,
        String expectedOutput,
        Boolean isHidden,
        String explanation,
        Integer displayOrder
) {}
