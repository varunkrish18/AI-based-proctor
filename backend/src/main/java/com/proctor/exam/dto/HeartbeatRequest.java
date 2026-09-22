package com.proctor.exam.dto;

public record HeartbeatRequest(
        String webcamStatus,
        String microphoneStatus,
        String screenStatus,
        String connectionStatus
) {}
