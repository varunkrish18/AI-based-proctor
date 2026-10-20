package com.proctor.exam.controller;

import com.proctor.exam.dto.ExamSummaryResponse;
import com.proctor.exam.dto.VerifyStudentRequest;
import com.proctor.exam.dto.VerifyStudentResponse;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.repository.ExamRepository;
import com.proctor.exam.service.StudentExamService;
import com.proctor.exam.service.TrustedTimeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Unauthenticated endpoints: the public exams list (landing page), network time, and email verification. */
@RestController
@RequestMapping("/api/exams")
public class PublicExamController {

    private final ExamRepository examRepository;
    private final StudentExamService studentExamService;
    private final TrustedTimeService trustedTimeService;
    private final com.proctor.exam.service.CodeExecutionService codeExecutionService;

    public PublicExamController(ExamRepository examRepository,
                                StudentExamService studentExamService,
                                TrustedTimeService trustedTimeService,
                                com.proctor.exam.service.CodeExecutionService codeExecutionService) {
        this.examRepository = examRepository;
        this.studentExamService = studentExamService;
        this.trustedTimeService = trustedTimeService;
        this.codeExecutionService = codeExecutionService;
    }

    @GetMapping("/time")
    public Map<String, Object> getNetworkTime() {
        Instant now = trustedTimeService.now();
        return Map.of(
                "iso", now.toString(),
                "epochMillis", now.toEpochMilli(),
                "source", trustedTimeService.getTimeSource()
        );
    }

    @GetMapping("/public")
    public List<ExamSummaryResponse> listPublicExams() {
        Instant now = trustedTimeService.now();
        return examRepository.findByStatus("PUBLISHED").stream()
                .map(e -> new ExamSummaryResponse(
                        e.getId(),
                        e.getName(),
                        e.getSubject(),
                        e.getNumQuestions(),
                        e.getDurationMinutes(),
                        e.getStartAt(),
                        e.getEndAt(),
                        computeDisplayStatus(e, now),
                        e.getAssignedProfessorId(),
                        e.getAssignedProfessorEmail(),
                        e.getAssignedProfessorName(),
                        Boolean.TRUE.equals(e.getIsClass())
                ))
                .toList();
    }

    private String computeDisplayStatus(Exam e, Instant now) {
        if (now.isBefore(e.getStartAt())) return "UPCOMING";
        if (now.isAfter(e.getEndAt())) return "CLOSED";
        return "OPEN";
    }

    @GetMapping("/{examId}")
    public Map<String, Object> getPublicExamDetails(@PathVariable Long examId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new com.proctor.exam.exception.ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Exam not found."));
        Map<String, Object> details = new java.util.LinkedHashMap<>();
        details.put("id", exam.getId());
        details.put("name", exam.getName());
        details.put("subject", exam.getSubject() != null ? exam.getSubject() : "");
        details.put("durationMinutes", exam.getDurationMinutes());
        details.put("numQuestions", exam.getNumQuestions());
        details.put("webcamRequired", exam.getWebcamRequired() != null ? exam.getWebcamRequired() : true);
        details.put("microphoneRequired", exam.getMicrophoneRequired() != null ? exam.getMicrophoneRequired() : true);
        details.put("screenRequired", exam.getScreenRequired() != null ? exam.getScreenRequired() : true);
        details.put("locationRequired", exam.getLocationRequired() != null ? exam.getLocationRequired() : false);
        details.put("openToAll", exam.isOpenToAll());
        details.put("assignedProfessorId", exam.getAssignedProfessorId());
        details.put("assignedProfessorEmail", exam.getAssignedProfessorEmail());
        details.put("assignedProfessorName", exam.getAssignedProfessorName());
        details.put("isClass", Boolean.TRUE.equals(exam.getIsClass()));
        return details;
    }

    @PostMapping("/{examId}/verify-student")
    public VerifyStudentResponse verifyStudent(@PathVariable Long examId, @Valid @RequestBody VerifyStudentRequest request) {
        return studentExamService.verifyStudent(examId, request.email(), request.password(), request.name(), request.registerNumber());
    }

    @PostMapping("/run-code")
    public com.proctor.exam.dto.RunCodeResponse runOnlineIdeCode(@Valid @RequestBody com.proctor.exam.dto.OnlineIdeRunRequest request) {
        return codeExecutionService.runAdhocCode(request.code(), request.language(), request.input());
    }
}
