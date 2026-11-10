package com.proctor.exam.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiFrameAnalysisResponse(
        boolean faceDetected,
        int faceCount,
        double confidence,
        boolean phoneDetected,
        Boolean objectDetected,
        List<String> detectedObjects,
        Boolean personBehindDetected,
        Boolean cameraCovered,
        String gazeDirection,
        HeadPoseDto headPose,
        List<Map<String, Object>> events,
        String modelVersion
) {
    public record HeadPoseDto(double yaw, double pitch, double roll) {}
}

