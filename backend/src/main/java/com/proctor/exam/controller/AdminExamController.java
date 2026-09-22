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

/** All endpoints here require ROLE_ADMIN (enforced in SecurityConfig). */
@RestController
@RequestMapping("/api/admin/exams")
public class AdminExamController {

    private final ExamAdminService examAdminService;

    public AdminExamController(ExamAdminService examAdminService) {
        this.examAdminService = examAdminService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Exam createExam(@Valid @RequestBody CreateExamRequest request, Authentication auth) {
        return examAdminService.createExam(request, auth.getName());
    }

    @GetMapping
    public List<Exam> listExams() {
        return examAdminService.listAll();
    }

    @GetMapping("/{examId}")
    public Exam getExam(@PathVariable Long examId) {
        return examAdminService.getById(examId);
    }

    @PostMapping("/{examId}/publish")
    public Exam publish(@PathVariable Long examId) {
        return examAdminService.publish(examId);
    }

    @PostMapping("/{examId}/questions")
    @ResponseStatus(HttpStatus.CREATED)
    public ExamQuestion addQuestion(@PathVariable Long examId, @Valid @RequestBody QuestionRequest request) {
        return examAdminService.addQuestion(examId, request);
    }

    @GetMapping("/{examId}/questions")
    public List<ExamQuestion> listQuestions(@PathVariable Long examId) {
        return examAdminService.listQuestions(examId);
    }

    @PostMapping("/{examId}/assign")
    public Map<String, Integer> assignStudents(@PathVariable Long examId, @Valid @RequestBody AssignStudentsRequest request) {
        return examAdminService.assignStudents(examId, request);
    }

    @PatchMapping("/{examId}/limit")
    public Exam updateLimit(@PathVariable Long examId, @RequestBody Map<String, Integer> body) {
        Integer limit = body.get("numQuestions");
        if (limit == null) {
            throw new com.proctor.exam.exception.ApiException(HttpStatus.BAD_REQUEST, "numQuestions is required.");
        }
        return examAdminService.updateNumQuestions(examId, limit);
    }

    @DeleteMapping("/{examId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExam(@PathVariable Long examId, Authentication auth) {
        examAdminService.deleteExam(examId, auth.getName());
    }

    @GetMapping("/{examId}/assignments")
    public List<com.proctor.exam.entity.ExamAssignment> listAssignments(@PathVariable Long examId) {
        return examAdminService.listAssignments(examId);
    }

    @DeleteMapping("/{examId}/assignments/{assignmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unassignStudent(@PathVariable Long examId, @PathVariable Long assignmentId) {
        examAdminService.unassignStudent(examId, assignmentId);
    }

    @PutMapping("/{examId}/questions/{questionId}")
    public ExamQuestion updateQuestion(@PathVariable Long examId,
                                       @PathVariable Long questionId,
                                       @Valid @RequestBody QuestionRequest request) {
        return examAdminService.updateQuestion(examId, questionId, request);
    }

    @DeleteMapping("/{examId}/questions/{questionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteQuestion(@PathVariable Long examId, @PathVariable Long questionId) {
        examAdminService.deleteQuestion(examId, questionId);
    }
}
