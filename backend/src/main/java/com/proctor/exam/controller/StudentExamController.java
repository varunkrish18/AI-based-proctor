package com.proctor.exam.controller;

import com.proctor.exam.dto.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.service.StudentExamService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * All endpoints here require a STUDENT session token (issued by /api/exams/{id}/verify-student),
 * enforced in SecurityConfig via ROLE_STUDENT. The authenticated principal name is the student's
 * verified email, so students can never act as another student.
 */
@RestController
@RequestMapping("/api/student")
public class StudentExamController {

    private final StudentExamService studentExamService;

    public StudentExamController(StudentExamService studentExamService) {
        this.studentExamService = studentExamService;
    }

    @PostMapping("/exams/{examId}/start")
    public StartExamResponse start(@PathVariable Long examId, Authentication auth, HttpServletRequest request) {
        requireMatchingExam(examId, request);
        return studentExamService.startExam(examId, auth.getName());
    }

    /**
     * A student session token is issued for exactly one exam (see verify-student).
     * Reject any attempt to use it against a different exam id.
     */
    private void requireMatchingExam(Long examId, HttpServletRequest request) {
        Object tokenExamId = request.getAttribute("studentSessionExamId");
        if (tokenExamId == null || !examId.equals(((Number) tokenExamId).longValue())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This session is not valid for the requested exam.");
        }
    }

    @PostMapping("/attempts/{attemptId}/answers")
    public void saveAnswer(@PathVariable Long attemptId, @Valid @RequestBody SubmitAnswerRequest request, Authentication auth) {
        studentExamService.saveAnswer(attemptId, auth.getName(), request);
    }

    @PostMapping("/attempts/{attemptId}/submit")
    public AttemptResultResponse submit(@PathVariable Long attemptId, Authentication auth) {
        return studentExamService.submit(attemptId, auth.getName());
    }
}
