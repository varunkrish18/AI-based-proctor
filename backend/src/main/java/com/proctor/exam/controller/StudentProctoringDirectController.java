package com.proctor.exam.controller;

import com.proctor.exam.dto.*;
import com.proctor.exam.entity.ExamAttempt;
import com.proctor.exam.entity.ProctoringSession;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.ExamAttemptRepository;
import com.proctor.exam.service.ProctoringEventService;
import com.proctor.exam.service.ProctoringSessionService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/student/proctoring")
public class StudentProctoringDirectController {

    private final ProctoringSessionService sessionService;
    private final ProctoringEventService eventService;
    private final ExamAttemptRepository attemptRepository;

    public StudentProctoringDirectController(ProctoringSessionService sessionService,
                                             ProctoringEventService eventService,
                                             ExamAttemptRepository attemptRepository) {
        this.sessionService = sessionService;
        this.eventService = eventService;
        this.attemptRepository = attemptRepository;
    }

    private ExamAttempt resolveAttempt(Long attemptId, String studentEmail) {
        if (attemptId != null) {
            return attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));
        }
        return attemptRepository.findTopByStudentEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(studentEmail, "IN_PROGRESS")
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No active exam attempt found for student."));
    }

    @PostMapping("/session/start")
    public ProctoringSessionResponse startSession(@RequestBody(required = false) ProctoringDirectSessionRequest request,
                                                  Authentication auth) {
        Long attemptId = request != null ? request.attemptId() : null;
        ExamAttempt attempt = resolveAttempt(attemptId, auth.getName());
        ProctoringSession session = sessionService.openSession(attempt.getId());
        return sessionService.toResponse(session);
    }

    @PostMapping("/event")
    public List<ProctoringEventResponse> recordEvent(@RequestBody ProctoringDirectEventRequest request,
                                                     Authentication auth) {
        ExamAttempt attempt = resolveAttempt(request.attemptId(), auth.getName());

        List<ClientEventItem> items;
        if (request.events() != null && !request.events().isEmpty()) {
            items = request.events();
        } else if (request.eventType() != null && !request.eventType().isBlank()) {
            Instant time = request.occurredAt() != null ? request.occurredAt() : Instant.now();
            items = List.of(new ClientEventItem(
                    request.eventType(),
                    time,
                    request.durationSeconds(),
                    request.metadata()
            ));
        } else {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Event payload cannot be empty.");
        }

        return eventService.recordEvents(attempt.getId(), auth.getName(), new EventBatchRequest(items));
    }

    @PostMapping("/session/end")
    public void endSession(@RequestBody(required = false) ProctoringDirectSessionRequest request,
                           Authentication auth) {
        Long attemptId = request != null ? request.attemptId() : null;
        ExamAttempt attempt = resolveAttempt(attemptId, auth.getName());
        sessionService.closeSession(attempt.getId());
    }
}
