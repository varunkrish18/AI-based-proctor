package com.proctor.exam.dto;

public record AssignProfessorRequest(
        Long professorId,
        String professorEmail,
        String professorName
) {}
