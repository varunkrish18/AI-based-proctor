package com.proctor.exam.service;

import com.proctor.exam.dto.AiFrameAnalysisResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class AiProxyService {

    private static final Logger log = LoggerFactory.getLogger(AiProxyService.class);

    private final String baseUrl;
    private final RestClient restClient;
    private final AtomicBoolean isAiServiceAvailable = new AtomicBoolean(true);

    public AiProxyService(
            @Value("${app.ai-service.base-url:http://localhost:8000}") String baseUrl,
            @Value("${app.ai-service.connect-timeout-ms:3000}") int connectTimeout,
            @Value("${app.ai-service.read-timeout-ms:6000}") int readTimeout) {

        this.baseUrl = baseUrl;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeout);
        requestFactory.setReadTimeout(readTimeout);

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    /**
     * Forwards a video frame to the Python FastAPI computer vision service.
     * Non-blocking for student: if the AI service is unreachable, returns fallback
     * without crashing or halting the exam.
     */
    public AiFrameAnalysisResponse analyzeFrame(Long attemptId, String base64Frame, Instant timestamp) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("sessionId", attemptId);
        payload.put("frame", base64Frame);
        if (timestamp != null) {
            payload.put("timestamp", timestamp.toString());
        }

        try {
            AiFrameAnalysisResponse response = restClient.post()
                    .uri("/v1/analyze/frame")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(AiFrameAnalysisResponse.class);

            if (!isAiServiceAvailable.get()) {
                log.info("AI Computer Vision service is back online.");
                isAiServiceAvailable.set(true);
            }
            return response != null ? response : fallbackResponse();
        } catch (Exception e) {
            if (isAiServiceAvailable.compareAndSet(true, false)) {
                log.warn("AI Computer Vision service is currently unavailable at endpoint: {}", e.getMessage());
            }
            return fallbackResponse();
        }
    }

    public boolean isServiceAvailable() {
        return isAiServiceAvailable.get();
    }

    public Map<String, Object> getHealth() {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restClient.get()
                    .uri("/health")
                    .retrieve()
                    .body(Map.class);
            return resp != null ? resp : Map.of("status", "UP", "degraded_mode", false);
        } catch (Exception e) {
            log.warn("Failed to reach AI service health check: {}", e.getMessage());
            return Map.of("status", "DOWN", "degraded_mode", true, "degraded_reason", "AI service unreachable: " + e.getMessage());
        }
    }

    private AiFrameAnalysisResponse fallbackResponse() {
        return new AiFrameAnalysisResponse(
                true, // Default to true on fallback so missing AI doesn't produce false positive penalties
                1,
                0.0,
                false, // phoneDetected: never flag a phone on fallback
                false, // objectDetected
                List.of(), // detectedObjects
                false, // personBehindDetected
                false, // cameraCovered
                "CENTER",
                null,
                List.of(),
                "fallback"
        );
    }

    /**
     * Calls Python AI service to generate exam questions using Google Gemini LLM.
     */
    public List<Map<String, Object>> generateExamQuestions(String topics, int numQuestions, String questionType, String difficulty) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("topics", topics);
        payload.put("numQuestions", numQuestions);
        payload.put("questionType", questionType != null ? questionType : "MIXED");
        payload.put("difficulty", difficulty != null ? difficulty : "Medium");

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(5000);
        requestFactory.setReadTimeout(45000);

        RestClient client = RestClient.builder()
                .baseUrl(this.baseUrl)
                .requestFactory(requestFactory)
                .build();

        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> response = client.post()
                    .uri("/v1/assessment/generate-exam-questions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(List.class);

            return response != null ? response : List.of();
        } catch (Exception e) {
            log.error("Failed to generate exam questions via AI service: {}", e.getMessage(), e);
            throw new com.proctor.exam.exception.ApiException(
                    org.springframework.http.HttpStatus.BAD_GATEWAY,
                    "AI question generation failed: " + e.getMessage()
            );
        }
    }
}

