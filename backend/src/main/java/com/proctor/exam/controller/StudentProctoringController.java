package com.proctor.exam.controller;

import com.proctor.exam.dto.*;
import com.proctor.exam.entity.ExamAttempt;
import com.proctor.exam.entity.ProctoringSession;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.ExamAttemptRepository;
import com.proctor.exam.service.AiProxyService;
import com.proctor.exam.service.FaceTemporalAggregator;
import com.proctor.exam.service.ProctoringEventService;
import com.proctor.exam.service.ProctoringSessionService;
import com.proctor.exam.service.RiskEngine;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/student/attempts/{attemptId}/proctoring")
public class StudentProctoringController {

    private final ProctoringSessionService sessionService;
    private final ProctoringEventService eventService;
    private final ExamAttemptRepository attemptRepository;
    private final AiProxyService aiProxyService;
    private final FaceTemporalAggregator faceTemporalAggregator;
    private final RiskEngine riskEngine;

    public StudentProctoringController(ProctoringSessionService sessionService,
                                       ProctoringEventService eventService,
                                       ExamAttemptRepository attemptRepository,
                                       AiProxyService aiProxyService,
                                       FaceTemporalAggregator faceTemporalAggregator,
                                       RiskEngine riskEngine) {
        this.sessionService = sessionService;
        this.eventService = eventService;
        this.attemptRepository = attemptRepository;
        this.aiProxyService = aiProxyService;
        this.faceTemporalAggregator = faceTemporalAggregator;
        this.riskEngine = riskEngine;
    }

    private void verifyAttemptOwnership(Long attemptId, String studentEmail) {
        ExamAttempt attempt = attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This attempt is no longer in progress.");
        }
    }

    @PostMapping("/session")
    public ProctoringSessionResponse openSession(@PathVariable Long attemptId, Authentication auth) {
        verifyAttemptOwnership(attemptId, auth.getName());
        ProctoringSession session = sessionService.openSession(attemptId);
        return sessionService.toResponse(session);
    }

    @PostMapping("/heartbeat")
    public ProctoringSessionResponse heartbeat(@PathVariable Long attemptId,
                                                @RequestBody(required = false) HeartbeatRequest request,
                                                Authentication auth) {
        return sessionService.heartbeat(attemptId, auth.getName(), request);
    }

    @PostMapping("/events")
    public List<ProctoringEventResponse> recordEvents(@PathVariable Long attemptId,
                                                      @Valid @RequestBody EventBatchRequest request,
                                                      Authentication auth) {
        return eventService.recordEvents(attemptId, auth.getName(), request);
    }

    @PostMapping("/frame")
    public AiFrameAnalysisResponse processFrame(@PathVariable Long attemptId,
                                                @Valid @RequestBody FrameUploadRequest request,
                                                Authentication auth) {
        verifyAttemptOwnership(attemptId, auth.getName());
        AiFrameAnalysisResponse aiResult = aiProxyService.analyzeFrame(attemptId, request.frame(), request.timestamp());
        faceTemporalAggregator.processFrameResult(attemptId, auth.getName(), aiResult, aiProxyService.isServiceAvailable());
        return aiResult;
    }

    @GetMapping("/warnings/latest")
    public WarningResponse getLatestWarning(@PathVariable Long attemptId, Authentication auth) {
        verifyAttemptOwnership(attemptId, auth.getName());
        return riskEngine.getLatestWarning(attemptId);
    }
}
