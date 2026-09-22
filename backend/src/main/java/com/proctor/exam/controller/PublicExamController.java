package com.proctor.exam.controller;

import com.proctor.exam.dto.ExamSummaryResponse;
import com.proctor.exam.dto.VerifyStudentRequest;
import com.proctor.exam.dto.VerifyStudentResponse;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.repository.ExamRepository;
import com.proctor.exam.service.StudentExamService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

/** Unauthenticated endpoints: the public exams list (landing page) and email verification. */
@RestController
@RequestMapping("/api/exams")
public class PublicExamController {

    private final ExamRepository examRepository;
    private final StudentExamService studentExamService;

    public PublicExamController(ExamRepository examRepository, StudentExamService studentExamService) {
        this.examRepository = examRepository;
        this.studentExamService = studentExamService;
    }

    @GetMapping("/public")
    public List<ExamSummaryResponse> listPublicExams() {
        Instant now = Instant.now();
        return examRepository.findByStatus("PUBLISHED").stream()
                .map(e -> new ExamSummaryResponse(e.getId(), e.getName(), e.getSubject(), e.getNumQuestions(),
                        e.getDurationMinutes(), e.getStartAt(), e.getEndAt(), computeDisplayStatus(e, now)))
                .toList();
    }

    private String computeDisplayStatus(Exam e, Instant now) {
        if (now.isBefore(e.getStartAt())) return "UPCOMING";
        if (now.isAfter(e.getEndAt())) return "CLOSED";
        return "OPEN";
    }

    @PostMapping("/{examId}/verify-student")
    public VerifyStudentResponse verifyStudent(@PathVariable Long examId, @Valid @RequestBody VerifyStudentRequest request) {
        return studentExamService.verifyStudent(examId, request.email());
    }
}
