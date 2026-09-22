package com.proctor.exam.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record EventBatchRequest(
        @NotEmpty List<@Valid ClientEventItem> events
) {}
