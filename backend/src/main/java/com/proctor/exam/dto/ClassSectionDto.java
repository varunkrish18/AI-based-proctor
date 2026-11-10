package com.proctor.exam.dto;

public record ClassSectionDto(
    String id,
    String className,
    String department,
    String year,
    String startReg,
    String endReg,
    Integer displayOrder
) {}

