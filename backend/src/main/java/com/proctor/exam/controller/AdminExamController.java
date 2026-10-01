package com.proctor.exam.controller;

import com.proctor.exam.dto.*;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.entity.ExamQuestion;
import com.proctor.exam.service.ExamAdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** All endpoints here require ROLE_ADMIN (enforced in SecurityConfig). */
@RestController
@RequestMapping("/api/admin/exams")
public class AdminExamController {

    private final ExamAdminService examAdminService;
    private final com.proctor.exam.service.CodeExecutionService codeExecutionService;

    public AdminExamController(ExamAdminService examAdminService,
                               com.proctor.exam.service.CodeExecutionService codeExecutionService) {
        this.examAdminService = examAdminService;
        this.codeExecutionService = codeExecutionService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Exam createExam(@Valid @RequestBody CreateExamRequest request, Authentication auth) {
        return examAdminService.createExam(request, auth != null ? auth.getName() : "admin");
    }

    @GetMapping
    public List<Exam> listExams(Authentication auth) {
        return examAdminService.listExamsForUser(auth != null ? auth.getName() : null);
    }

    @GetMapping("/{examId}")
    public Exam getExam(@PathVariable Long examId, Authentication auth) {
        return examAdminService.getExamForUser(examId, auth != null ? auth.getName() : null);
    }

    @PutMapping("/{examId}")
    public Exam updateExam(@PathVariable Long examId,
                           @Valid @RequestBody UpdateExamRequest request,
                           Authentication auth) {
        return examAdminService.updateExam(examId, request, auth != null ? auth.getName() : "admin");
    }

    @PostMapping("/{examId}/publish")
    public Exam publish(@PathVariable Long examId, Authentication auth) {
        return examAdminService.publish(examId, auth != null ? auth.getName() : "admin");
    }

    @PostMapping("/{examId}/questions")
    @ResponseStatus(HttpStatus.CREATED)
    public ExamQuestion addQuestion(@PathVariable Long examId, @Valid @RequestBody QuestionRequest request, Authentication auth) {
        return examAdminService.addQuestion(examId, request, auth != null ? auth.getName() : "admin");
    }

    @GetMapping("/{examId}/questions")
    public List<ExamQuestion> listQuestions(@PathVariable Long examId, Authentication auth) {
        return examAdminService.listQuestions(examId, auth != null ? auth.getName() : null);
    }

    @PostMapping("/{examId}/ai-generate-questions")
    public List<ExamQuestion> generateAiQuestions(
            @PathVariable Long examId,
            @Valid @RequestBody AiGenerateQuestionsRequest request,
            Authentication auth) {
        String adminEmail = auth != null ? auth.getName() : "admin";
        return examAdminService.generateAndAddAiQuestions(examId, request, adminEmail);
    }

    @PostMapping("/{examId}/assign")
    public Map<String, Object> assignStudents(@PathVariable Long examId, @Valid @RequestBody AssignStudentsRequest request, Authentication auth) {
        return examAdminService.assignStudents(examId, request, auth != null ? auth.getName() : "admin");
    }

    @PostMapping("/{examId}/open-to-all")
    public Exam setOpenToAll(@PathVariable Long examId, @RequestBody Map<String, Boolean> body, Authentication auth) {
        Boolean openToAll = body.getOrDefault("openToAll", false);
        return examAdminService.setOpenToAll(examId, openToAll, auth != null ? auth.getName() : "admin");
    }

    @PatchMapping("/{examId}/limit")
    public Exam updateLimit(@PathVariable Long examId, @RequestBody Map<String, Integer> body, Authentication auth) {
        Integer limit = body.get("numQuestions");
        if (limit == null) {
            throw new com.proctor.exam.exception.ApiException(HttpStatus.BAD_REQUEST, "numQuestions is required.");
        }
        return examAdminService.updateNumQuestions(examId, limit, auth != null ? auth.getName() : "admin");
    }

    @DeleteMapping("/{examId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExam(@PathVariable Long examId, Authentication auth) {
        examAdminService.deleteExam(examId, auth != null ? auth.getName() : "admin");
    }

    @GetMapping("/{examId}/assignments")
    public List<com.proctor.exam.entity.ExamAssignment> listAssignments(@PathVariable Long examId, Authentication auth) {
        return examAdminService.listAssignments(examId, auth != null ? auth.getName() : null);
    }

    @DeleteMapping("/{examId}/assignments/{assignmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unassignStudent(@PathVariable Long examId, @PathVariable Long assignmentId, Authentication auth) {
        examAdminService.unassignStudent(examId, assignmentId, auth != null ? auth.getName() : "admin");
    }

    @PutMapping("/{examId}/questions/{questionId}")
    public ExamQuestion updateQuestion(@PathVariable Long examId,
                                       @PathVariable Long questionId,
                                       @Valid @RequestBody QuestionRequest request,
                                       Authentication auth) {
        return examAdminService.updateQuestion(examId, questionId, request, auth != null ? auth.getName() : "admin");
    }

    @DeleteMapping("/{examId}/questions/{questionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteQuestion(@PathVariable Long examId, @PathVariable Long questionId, Authentication auth) {
        examAdminService.deleteQuestion(examId, questionId, auth != null ? auth.getName() : "admin");
    }

    @PostMapping("/questions/test-run")
    public RunCodeResponse testRunCode(@Valid @RequestBody AdminTestRunRequest request) {
        return codeExecutionService.testRun(request.testCases(), request.code(), request.language());
    }

    /**
     * Randomly assigns a fixed number of questions from the exam's question bank
     * to each enrolled student.  Overwrites any prior assignment for this exam.
     *
     * Body: { "questionsPerStudent": 2 }
     */
    @PostMapping("/{examId}/assign-questions-randomly")
    public com.proctor.exam.dto.QuestionAssignmentReportResponse assignQuestionsRandomly(
            @PathVariable Long examId,
            @RequestBody Map<String, Integer> body,
            Authentication auth) {
        int qps = Optional.ofNullable(body.get("questionsPerStudent")).orElse(0);
        if (qps <= 0) {
            throw new com.proctor.exam.exception.ApiException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "questionsPerStudent must be a positive integer.");
        }
        return examAdminService.assignQuestionsRandomly(
                examId, qps, auth != null ? auth.getName() : "admin");
    }

    /**
     * Returns the current question-assignment report for an exam
     * (which student got which questions).
     */
    @GetMapping("/{examId}/question-assignment-report")
    public com.proctor.exam.dto.QuestionAssignmentReportResponse getQuestionAssignmentReport(
            @PathVariable Long examId,
            Authentication auth) {
        return examAdminService.getQuestionAssignmentReport(
                examId, auth != null ? auth.getName() : "admin");
    }
}
