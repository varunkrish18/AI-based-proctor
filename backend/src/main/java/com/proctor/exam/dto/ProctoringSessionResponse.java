package com.proctor.exam.dto;

import java.time.Instant;

public record ProctoringSessionResponse(
        Long id,
        Long attemptId,
        Boolean webcamRequired,
        Boolean microphoneRequired,
        Boolean screenRequired,
        Boolean locationRequired,
        String webcamStatus,
        String microphoneStatus,
        String screenStatus,
        String connectionStatus,
        Instant startedAt,
        Instant lastHeartbeatAt,
        Instant endedAt
) {}
