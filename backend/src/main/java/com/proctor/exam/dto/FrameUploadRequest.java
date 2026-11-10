package com.proctor.exam.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;

public record FrameUploadRequest(
        @NotBlank String frame,
        Instant timestamp
) {}
