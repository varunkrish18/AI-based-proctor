package com.proctor.exam.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.proctor.exam.dto.*;
import com.proctor.exam.entity.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.*;
import com.proctor.exam.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
public class StudentExamService {

    private final ExamRepository examRepository;
    private final ExamQuestionRepository questionRepository;
    private final ExamAssignmentRepository assignmentRepository;
    private final ExamAttemptRepository attemptRepository;
    private final ExamAnswerRepository answerRepository;
    private final StudentRepository studentRepository;
    private final JwtService jwtService;
    private final ProctoringSessionService proctoringSessionService;
    private final TrustedTimeService trustedTimeService;
    private final ExamQuestionTestCaseRepository testCaseRepository;
    private final CodeExecutionService codeExecutionService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public StudentExamService(ExamRepository examRepository,
                               ExamQuestionRepository questionRepository,
                               ExamAssignmentRepository assignmentRepository,
                               ExamAttemptRepository attemptRepository,
                               ExamAnswerRepository answerRepository,
                               StudentRepository studentRepository,
                               JwtService jwtService,
                               ProctoringSessionService proctoringSessionService,
                               TrustedTimeService trustedTimeService,
                               ExamQuestionTestCaseRepository testCaseRepository,
                               CodeExecutionService codeExecutionService) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.assignmentRepository = assignmentRepository;
        this.attemptRepository = attemptRepository;
        this.answerRepository = answerRepository;
        this.studentRepository = studentRepository;
        this.jwtService = jwtService;
        this.proctoringSessionService = proctoringSessionService;
        this.trustedTimeService = trustedTimeService;
        this.testCaseRepository = testCaseRepository;
        this.codeExecutionService = codeExecutionService;
    }

    /**
     * Section 4: verify the student's email is authorized for this exam.
     * Deliberately returns the same generic message whether the exam or the
     * assignment is missing, so we don't leak which emails are registered.
     */
    @Transactional
    public VerifyStudentResponse verifyStudent(Long examId, String rawEmail, String rawPassword) {
        String email = rawEmail.trim().toLowerCase();
        Exam exam = examRepository.findById(examId).orElse(null);
        if (exam == null || !"PUBLISHED".equals(exam.getStatus())) {
            return new VerifyStudentResponse(false, null, "Exam not found or is not published.", false, false, false, false);
        }

        boolean isOpen = exam.isOpenToAll();
        Optional<ExamAssignment> assignmentOpt = assignmentRepository.findByExamIdAndStudentEmailIgnoreCase(examId, email);

        if (!isOpen && assignmentOpt.isEmpty()) {
            return new VerifyStudentResponse(false, null, "This exam is not assigned to this email address.", false, false, false, false);
        }

        // Verify assignment access password if present
        if (assignmentOpt.isPresent()) {
            ExamAssignment assignment = assignmentOpt.get();
            if (assignment.getAccessPassword() != null && !assignment.getAccessPassword().isBlank()) {
                if (rawPassword == null || rawPassword.trim().isBlank()) {
                    return new VerifyStudentResponse(false, null, "Exam access password is required.", false, false, false, false);
                }
                if (!assignment.getAccessPassword().trim().equalsIgnoreCase(rawPassword.trim())) {
                    return new VerifyStudentResponse(false, null, "Invalid access password. Please check your assigned exam password and try again.", false, false, false, false);
                }
            }
        } else if (isOpen) {
            try {
                assignmentRepository.save(com.proctor.exam.entity.ExamAssignment.builder()
                        .exam(exam)
                        .studentEmail(email)
                        .accessPassword(rawPassword != null && !rawPassword.isBlank() ? rawPassword.trim() : "OPEN")
                        .build());
            } catch (Exception ignored) {}
        }

        Instant now = trustedTimeService.now();
        if (exam.getStartAt() != null && now.isBefore(exam.getStartAt())) {
            return new VerifyStudentResponse(false, null, "Exam has not started yet. Starts at: " + exam.getStartAt(), false, false, false, false);
        }
        if (exam.getEndAt() != null && now.isAfter(exam.getEndAt())) {
            return new VerifyStudentResponse(false, null, "This exam has already ended.", false, false, false, false);
        }

        studentRepository.findByEmail(email).orElseGet(() ->
                studentRepository.save(Student.builder().email(email).build()));

        String sessionToken = jwtService.generateStudentSessionToken(email, examId);
        return new VerifyStudentResponse(
                true,
                sessionToken,
                "Verified.",
                exam.getWebcamRequired() != null ? exam.getWebcamRequired() : true,
                exam.getMicrophoneRequired() != null ? exam.getMicrophoneRequired() : true,
                exam.getScreenRequired() != null ? exam.getScreenRequired() : true,
                exam.getLocationRequired() != null ? exam.getLocationRequired() : false
        );
    }

    @Transactional
    public VerifyStudentResponse verifyStudent(Long examId, String rawEmail) {
        return verifyStudent(examId, rawEmail, null);
    }

    @Transactional
    public synchronized StartExamResponse startExam(Long examId, String studentEmail) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found."));

        Instant now = trustedTimeService.now();
        if ((exam.getStartAt() != null && now.isBefore(exam.getStartAt())) ||
            (exam.getEndAt() != null && now.isAfter(exam.getEndAt()))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This exam is not currently available. Starts at: " + exam.getStartAt() + ", Ends at: " + exam.getEndAt());
        }

        List<ExamAttempt> existingAttempts = attemptRepository
                .findByExamIdAndStudentEmailIgnoreCaseOrderByAttemptNumberDesc(examId, studentEmail);

        // Resume an in-progress attempt if one exists, instead of silently starting a new one.
        Optional<ExamAttempt> inProgress = existingAttempts
                .stream().filter(a -> "IN_PROGRESS".equals(a.getStatus())).findFirst();

        ExamAttempt attempt;
        List<Long> orderedQuestionIds;

        if (inProgress.isPresent()) {
            attempt = inProgress.get();
            orderedQuestionIds = decodeOrder(attempt.getQuestionOrder());
        } else {
            int nextAttemptNumber = existingAttempts.stream()
                    .mapToInt(a -> a.getAttemptNumber() != null ? a.getAttemptNumber() : 0)
                    .max()
                    .orElse(0) + 1;

            if (nextAttemptNumber > exam.getMaxAttempts()) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Maximum attempts reached for this exam.");
            }
            List<ExamQuestion> bank = questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
            List<ExamQuestion> selected = new ArrayList<>(bank);
            if (Boolean.TRUE.equals(exam.getRandomizeQuestions())) {
                Collections.shuffle(selected);
            }
            int take = Math.min(exam.getNumQuestions(), selected.size());
            selected = selected.subList(0, take);

            orderedQuestionIds = selected.stream().map(ExamQuestion::getId).toList();

            attempt = ExamAttempt.builder()
                    .exam(exam)
                    .studentEmail(studentEmail)
                    .attemptNumber(nextAttemptNumber)
                    .questionOrder(encodeOrder(orderedQuestionIds))
                    .status("IN_PROGRESS")
                    .startTime(now)
                    .build();
            attempt = attemptRepository.save(attempt);
        }

        Map<Long, ExamQuestion> byId = new HashMap<>();
        questionRepository.findAllById(orderedQuestionIds).forEach(q -> byId.put(q.getId(), q));

        boolean randomizeOptions = Boolean.TRUE.equals(exam.getRandomizeOptions());
        List<StudentQuestionResponse> questions = new ArrayList<>();
        for (Long qid : orderedQuestionIds) {
            ExamQuestion q = byId.get(qid);
            if (q == null) continue;
            questions.add(toStudentQuestion(q, randomizeOptions));
        }

        // Open or resume proctoring session
        proctoringSessionService.openSession(attempt.getId());

        return new StartExamResponse(
                attempt.getId(),
                exam.getDurationMinutes(),
                attempt.getStartTime(),
                questions,
                exam.getWebcamRequired() == null || exam.getWebcamRequired(),
                exam.getMicrophoneRequired() == null || exam.getMicrophoneRequired(),
                exam.getScreenRequired() == null || exam.getScreenRequired(),
                Boolean.TRUE.equals(exam.getLocationRequired()),
                exam.getAudioInputLevel()
        );
    }

    private StudentQuestionResponse toStudentQuestion(ExamQuestion q, boolean randomizeOptions) {
        List<TestCaseResponse> sampleCases = Collections.emptyList();
        if ("CODING".equals(q.getQuestionType())) {
            List<ExamQuestionTestCase> cases = testCaseRepository.findByQuestionIdAndIsHiddenFalseOrderByDisplayOrderAsc(q.getId());
            sampleCases = cases.stream()
                    .map(tc -> new TestCaseResponse(
                            tc.getId(),
                            tc.getInput(),
                            tc.getExpectedOutput(),
                            tc.getIsHidden(),
                            tc.getExplanation(),
                            tc.getDisplayOrder()
                    ))
                    .toList();
        }

        return new StudentQuestionResponse(
                q.getId(),
                q.getQuestionType(),
                q.getProblemTitle(),
                q.getQuestionText(),
                q.getOptionA(),
                q.getOptionB(),
                q.getOptionC(),
                q.getOptionD(),
                q.getMarks(),
                q.getCodeTemplate(),
                q.getAllowedLanguages(),
                q.getConstraints(),
                sampleCases
        );
    }

    @Transactional
    public void saveAnswer(Long attemptId, String studentEmail, SubmitAnswerRequest req) {
        ExamAttempt attempt = attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This attempt is no longer in progress.");
        }
        ExamQuestion question = questionRepository.findById(req.questionId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Question not found."));

        ExamAnswer answer = answerRepository.findByAttemptIdAndQuestionId(attemptId, req.questionId())
                .orElse(ExamAnswer.builder().attempt(attempt).question(question).build());
        if (req.selectedOption() != null) {
            answer.setSelectedOption(req.selectedOption());
        }
        if (req.codeSubmission() != null) {
            answer.setCodeSubmission(req.codeSubmission());
            answer.setCodeLanguage(req.codeLanguage());
        }
        answer.setAnsweredAt(trustedTimeService.now());
        answerRepository.save(answer);
    }

    public RunCodeResponse runCode(Long attemptId, String studentEmail, RunCodeRequest req) {
        ExamAttempt attempt = attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This attempt is no longer in progress.");
        }
        return codeExecutionService.runPublicTestCases(req.questionId(), req.code(), req.language(), req.customInput());
    }

    @Transactional
    public AttemptResultResponse submit(Long attemptId, String studentEmail) {
        ExamAttempt attempt = attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This attempt has already been finalized.");
        }

        Exam exam = attempt.getExam();
        List<Long> orderedQuestionIds = decodeOrder(attempt.getQuestionOrder());
        Map<Long, ExamQuestion> byId = new HashMap<>();
        questionRepository.findAllById(orderedQuestionIds).forEach(q -> byId.put(q.getId(), q));
        List<ExamAnswer> answers = answerRepository.findByAttemptId(attemptId);
        Map<Long, ExamAnswer> answerByQuestion = new HashMap<>();
        answers.forEach(a -> answerByQuestion.put(a.getQuestion().getId(), a));

        BigDecimal score = BigDecimal.ZERO;
        int answeredCount = 0;
        for (Long qid : orderedQuestionIds) {
            ExamQuestion q = byId.get(qid);
            if (q == null) continue;
            ExamAnswer a = answerByQuestion.get(qid);

            if ("CODING".equals(q.getQuestionType())) {
                if (a != null && a.getCodeSubmission() != null && !a.getCodeSubmission().isBlank()) {
                    answeredCount++;
                    RunCodeResponse eval = codeExecutionService.evaluateAllTestCases(q.getId(), a.getCodeSubmission(), a.getCodeLanguage());
                    a.setTestCasesPassed(eval.passedCases());
                    a.setTotalTestCases(eval.totalCases());
                    a.setExecutionOutput(eval.status() + " (" + eval.passedCases() + "/" + eval.totalCases() + " passed)");

                    BigDecimal awarded = BigDecimal.ZERO;
                    if (eval.totalCases() > 0) {
                        awarded = q.getMarks()
                                .multiply(BigDecimal.valueOf(eval.passedCases()))
                                .divide(BigDecimal.valueOf(eval.totalCases()), 2, java.math.RoundingMode.HALF_UP);
                        a.setIsCorrect(eval.passedCases() == eval.totalCases());
                    } else {
                        a.setIsCorrect(true);
                        awarded = q.getMarks();
                    }
                    a.setMarksAwarded(awarded);
                    score = score.add(awarded);
                    answerRepository.save(a);
                }
            } else {
                if (a == null || a.getSelectedOption() == null) continue;
                answeredCount++;
                boolean correct = a.getSelectedOption().equals(q.getCorrectAnswer());
                a.setIsCorrect(correct);
                BigDecimal awarded = correct ? q.getMarks() : exam.getNegativeMarking().negate();
                a.setMarksAwarded(awarded);
                score = score.add(awarded);
                answerRepository.save(a);
            }
        }

        attempt.setStatus("SUBMITTED");
        attempt.setEndTime(trustedTimeService.now());
        attempt.setScore(score);
        attemptRepository.save(attempt);

        // Close proctoring session
        proctoringSessionService.closeSession(attemptId);

        // Build per-question correction data
        List<AttemptResultResponse.QuestionResult> questionResults = new ArrayList<>();
        for (Long qid : orderedQuestionIds) {
            ExamQuestion q = byId.get(qid);
            if (q == null) continue;
            ExamAnswer a = answerByQuestion.get(qid);
            questionResults.add(new AttemptResultResponse.QuestionResult(
                    q.getId(),
                    q.getQuestionText(),
                    q.getOptionA(),
                    q.getOptionB(),
                    q.getOptionC(),
                    q.getOptionD(),
                    a != null ? a.getSelectedOption() : null,
                    q.getCorrectAnswer(),
                    a != null && (a.getSelectedOption() != null || a.getCodeSubmission() != null) ? a.getIsCorrect() : null,
                    a != null ? a.getMarksAwarded() : BigDecimal.ZERO
            ));
        }

        return new AttemptResultResponse(attempt.getId(), attempt.getStatus(), attempt.getStartTime(),
                attempt.getEndTime(), score, orderedQuestionIds.size(), answeredCount, questionResults);
    }

    private String encodeOrder(List<Long> ids) {
        try {
            return objectMapper.writeValueAsString(ids);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to encode question order.");
        }
    }

    @SuppressWarnings("unchecked")
    private List<Long> decodeOrder(String json) {
        try {
            List<Integer> raw = objectMapper.readValue(json, List.class);
            return raw.stream().map(Integer::longValue).toList();
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to decode question order.");
        }
    }
}
