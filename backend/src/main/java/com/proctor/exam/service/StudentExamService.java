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
    private final ObjectMapper objectMapper = new ObjectMapper();

    public StudentExamService(ExamRepository examRepository,
                               ExamQuestionRepository questionRepository,
                               ExamAssignmentRepository assignmentRepository,
                               ExamAttemptRepository attemptRepository,
                               ExamAnswerRepository answerRepository,
                               StudentRepository studentRepository,
                               JwtService jwtService,
                               ProctoringSessionService proctoringSessionService) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.assignmentRepository = assignmentRepository;
        this.attemptRepository = attemptRepository;
        this.answerRepository = answerRepository;
        this.studentRepository = studentRepository;
        this.jwtService = jwtService;
        this.proctoringSessionService = proctoringSessionService;
    }

    /**
     * Section 4: verify the student's email is authorized for this exam.
     * Deliberately returns the same generic message whether the exam or the
     * assignment is missing, so we don't leak which emails are registered.
     */
    @Transactional
    public VerifyStudentResponse verifyStudent(Long examId, String rawEmail) {
        String email = rawEmail.trim().toLowerCase();
        Exam exam = examRepository.findById(examId).orElse(null);
        boolean authorized = exam != null
                && "PUBLISHED".equals(exam.getStatus())
                && assignmentRepository.existsByExamIdAndStudentEmailIgnoreCase(examId, email);

        if (!authorized) {
            return new VerifyStudentResponse(false, null, "This exam is not assigned to this email address.");
        }

        studentRepository.findByEmail(email).orElseGet(() ->
                studentRepository.save(Student.builder().email(email).build()));

        String sessionToken = jwtService.generateStudentSessionToken(email, examId);
        return new VerifyStudentResponse(true, sessionToken, "Verified.");
    }

    @Transactional
    public synchronized StartExamResponse startExam(Long examId, String studentEmail) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found."));

        Instant now = Instant.now();
        if (now.isBefore(exam.getStartAt()) || now.isAfter(exam.getEndAt())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This exam is not currently available.");
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
                Boolean.TRUE.equals(exam.getLocationRequired())
        );
    }

    private StudentQuestionResponse toStudentQuestion(ExamQuestion q, boolean randomizeOptions) {
        // NOTE: For simplicity, option randomization is display-only on a fixed A/B/C/D
        // mapping here; a full implementation stores the per-attempt option permutation
        // alongside questionOrder so correctAnswer can be re-mapped consistently at grading time.
        return new StudentQuestionResponse(q.getId(), q.getQuestionText(), q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD());
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
        answer.setSelectedOption(req.selectedOption());
        answer.setAnsweredAt(Instant.now());
        answerRepository.save(answer);
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
            if (a == null || a.getSelectedOption() == null) continue;
            answeredCount++;
            boolean correct = a.getSelectedOption().equals(q.getCorrectAnswer());
            a.setIsCorrect(correct);
            BigDecimal awarded = correct ? q.getMarks() : exam.getNegativeMarking().negate();
            a.setMarksAwarded(awarded);
            score = score.add(awarded);
            answerRepository.save(a);
        }

        attempt.setStatus("SUBMITTED");
        attempt.setEndTime(Instant.now());
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
                    a != null && a.getSelectedOption() != null ? a.getIsCorrect() : null,
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
