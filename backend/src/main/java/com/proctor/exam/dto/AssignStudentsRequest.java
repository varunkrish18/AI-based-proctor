package com.proctor.exam.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record AssignStudentsRequest(@NotEmpty List<String> emails) {}
