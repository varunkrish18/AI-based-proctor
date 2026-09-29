package com.proctor.exam.service;

import com.proctor.exam.dto.*;
import com.proctor.exam.entity.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class ExamAdminService {

    private final ExamRepository examRepository;
    private final ExamQuestionRepository questionRepository;
    private final ExamAssignmentRepository assignmentRepository;
    private final AdminRepository adminRepository;
    private final AuditLogService auditLogService;
    private final jakarta.persistence.EntityManager entityManager;

    public ExamAdminService(ExamRepository examRepository,
                            ExamQuestionRepository questionRepository,
                            ExamAssignmentRepository assignmentRepository,
                            AdminRepository adminRepository,
                            AuditLogService auditLogService,
                            jakarta.persistence.EntityManager entityManager) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.assignmentRepository = assignmentRepository;
        this.adminRepository = adminRepository;
        this.auditLogService = auditLogService;
        this.entityManager = entityManager;
    }

    @Transactional
    public Exam createExam(CreateExamRequest req, String adminEmail) {
        if (!req.endAt().isAfter(req.startAt())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "endAt must be after startAt.");
        }
        Admin admin = adminRepository.findByEmail(adminEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Admin not found."));

        Exam exam = Exam.builder()
                .name(req.name())
                .description(req.description())
                .subject(req.subject())
                .durationMinutes(req.durationMinutes())
                .startAt(req.startAt())
                .endAt(req.endAt())
                .numQuestions(req.numQuestions())
                .passingMarks(req.passingMarks())
                .negativeMarking(req.negativeMarking() == null ? java.math.BigDecimal.ZERO : req.negativeMarking())
                .randomizeQuestions(req.randomizeQuestions() == null || req.randomizeQuestions())
                .randomizeOptions(req.randomizeOptions() == null || req.randomizeOptions())
                .maxAttempts(req.maxAttempts() == null ? 1 : req.maxAttempts())
                .webcamRequired(req.webcamRequired() == null || req.webcamRequired())
                .microphoneRequired(req.microphoneRequired() == null || req.microphoneRequired())
                .screenRequired(req.screenRequired() == null || req.screenRequired())
                .locationRequired(Boolean.TRUE.equals(req.locationRequired()))
                .proctoringConfig(buildProctoringConfigWithAudio(req.audioInputLevel()))
                .status("DRAFT")
                .createdBy(admin.getId())
                .build();
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin(adminEmail, "EXAM_CREATED", "Created exam '" + saved.getName() + "' (ID: " + saved.getId() + ")");
        return saved;
    }

    @Transactional
    public Exam updateExam(Long examId, UpdateExamRequest req, String adminEmail) {
        Exam exam = getById(examId);

        Instant newStartAt = req.startAt() != null ? req.startAt() : exam.getStartAt();
        Instant newEndAt = req.endAt() != null ? req.endAt() : exam.getEndAt();
        if (newEndAt != null && newStartAt != null && !newEndAt.isAfter(newStartAt)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "endAt must be after startAt.");
        }

        if (req.name() != null && !req.name().isBlank()) {
            exam.setName(req.name().trim());
        }
        if (req.description() != null) {
            exam.setDescription(req.description().trim());
        }
        if (req.subject() != null) {
            exam.setSubject(req.subject().trim());
        }
        if (req.durationMinutes() != null) {
            exam.setDurationMinutes(req.durationMinutes());
        }
        if (req.startAt() != null) {
            exam.setStartAt(req.startAt());
        }
        if (req.endAt() != null) {
            exam.setEndAt(req.endAt());
        }
        if (req.numQuestions() != null) {
            exam.setNumQuestions(req.numQuestions());
        }
        if (req.passingMarks() != null) {
            exam.setPassingMarks(req.passingMarks());
        }
        if (req.negativeMarking() != null) {
            exam.setNegativeMarking(req.negativeMarking());
        }
        if (req.randomizeQuestions() != null) {
            exam.setRandomizeQuestions(req.randomizeQuestions());
        }
        if (req.randomizeOptions() != null) {
            exam.setRandomizeOptions(req.randomizeOptions());
        }
        if (req.maxAttempts() != null) {
            exam.setMaxAttempts(req.maxAttempts());
        }
        if (req.webcamRequired() != null) {
            exam.setWebcamRequired(req.webcamRequired());
        }
        if (req.microphoneRequired() != null) {
            exam.setMicrophoneRequired(req.microphoneRequired());
        }
        if (req.screenRequired() != null) {
            exam.setScreenRequired(req.screenRequired());
        }
        if (req.locationRequired() != null) {
            exam.setLocationRequired(req.locationRequired());
        }
        if (req.audioInputLevel() != null) {
            exam.setProctoringConfig(buildProctoringConfigWithAudio(req.audioInputLevel()));
        }
        if (req.openToAll() != null) {
            exam.setOpenToAll(req.openToAll());
        }
        if (req.status() != null && !req.status().isBlank()) {
            String st = req.status().trim().toUpperCase();
            if (List.of("DRAFT", "PUBLISHED", "CLOSED").contains(st)) {
                exam.setStatus(st);
            }
        }
        exam.setUpdatedAt(Instant.now());
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin(adminEmail, "EXAM_UPDATED", "Updated exam '" + saved.getName() + "' (ID: " + saved.getId() + ")");
        return saved;
    }

    public List<Exam> listAll() {
        return examRepository.findAll();
    }

    public Exam getById(Long id) {
        return examRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found."));
    }

    @Transactional
    public Exam publish(Long examId) {
        Exam exam = getById(examId);
        long questionCount = questionRepository.countByExamId(examId);
        if (questionCount < exam.getNumQuestions()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Exam has " + questionCount + " question(s) but numQuestions is set to " + exam.getNumQuestions() + ".");
        }
        exam.setStatus("PUBLISHED");
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin("admin", "EXAM_PUBLISHED", "Published exam ID " + examId + " ('" + saved.getName() + "')");
        return saved;
    }

    @Transactional
    public ExamQuestion addQuestion(Long examId, QuestionRequest req) {
        Exam exam = getById(examId);
        long currentCount = questionRepository.countByExamId(examId);
        if (currentCount >= exam.getNumQuestions()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Exam question limit reached (" + exam.getNumQuestions() + " max questions). Increase the exam question limit or delete an existing question.");
        }
        int order = (int) currentCount;
        String qType = req.questionType() != null && !req.questionType().isBlank() ? req.questionType().toUpperCase() : "MCQ";

        if ("CODING".equals(qType)) {
            if (req.testCases() == null || req.testCases().isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Coding questions require at least one test case.");
            }
        } else {
            if (req.optionA() == null || req.optionB() == null || req.optionC() == null || req.optionD() == null || req.correctAnswer() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MCQ questions require 4 options (A, B, C, D) and a valid correct answer (0-3).");
            }
        }

        ExamQuestion q = ExamQuestion.builder()
                .exam(exam)
                .questionType(qType)
                .problemTitle(req.problemTitle())
                .questionText(req.questionText())
                .optionA(req.optionA())
                .optionB(req.optionB())
                .optionC(req.optionC())
                .optionD(req.optionD())
                .correctAnswer(req.correctAnswer())
                .codeTemplate(req.codeTemplate())
                .allowedLanguages(req.allowedLanguages() != null ? req.allowedLanguages() : "python,javascript")
                .constraints(req.constraints())
                .marks(req.marks())
                .displayOrder(order)
                .build();

        if ("CODING".equals(qType) && req.testCases() != null) {
            int tcOrder = 0;
            for (com.proctor.exam.dto.TestCaseRequest tcReq : req.testCases()) {
                ExamQuestionTestCase tc = ExamQuestionTestCase.builder()
                        .question(q)
                        .input(tcReq.input() != null ? tcReq.input() : "")
                        .expectedOutput(tcReq.expectedOutput() != null ? tcReq.expectedOutput() : "")
                        .isHidden(Boolean.TRUE.equals(tcReq.isHidden()))
                        .explanation(tcReq.explanation())
                        .displayOrder(tcReq.displayOrder() != null ? tcReq.displayOrder() : tcOrder++)
                        .build();
                q.getTestCases().add(tc);
            }
        }

        ExamQuestion saved = questionRepository.save(q);
        auditLogService.logAdmin("admin", "QUESTION_ADDED", "Added " + qType + " question ID " + saved.getId() + " to exam ID " + examId);
        return saved;
    }

    @Transactional
    public Exam updateNumQuestions(Long examId, int numQuestions) {
        if (numQuestions <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "numQuestions must be greater than 0.");
        }
        Exam exam = getById(examId);
        exam.setNumQuestions(numQuestions);
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin("admin", "EXAM_LIMIT_UPDATED",
                "Updated question limit to " + numQuestions + " for exam ID " + examId);
        return saved;
    }

    public List<ExamQuestion> listQuestions(Long examId) {
        getById(examId);
        return questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
    }

    @Transactional
    public Map<String, Integer> assignStudents(Long examId, AssignStudentsRequest req) {
        Exam exam = getById(examId);
        int assigned = 0;
        int skipped = 0;
        for (String rawEmail : req.emails()) {
            String email = rawEmail.trim().toLowerCase();
            if (email.isBlank()) continue;
            if (!assignmentRepository.existsByExamIdAndStudentEmailIgnoreCase(examId, email)) {
                assignmentRepository.save(ExamAssignment.builder().exam(exam).studentEmail(email).build());
                assigned++;
            } else {
                skipped++;
            }
        }
        auditLogService.logAdmin("admin", "STUDENTS_ASSIGNED", "Assigned " + assigned + " new student(s) to exam ID " + examId);
        return Map.of("assigned", assigned, "skipped", skipped);
    }

    @Transactional
    public Exam setOpenToAll(Long examId, boolean openToAll) {
        Exam exam = getById(examId);
        exam.setOpenToAll(openToAll);
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin("admin", "EXAM_OPEN_TO_ALL_UPDATED",
                "Updated open-to-all status to " + openToAll + " for exam ID " + examId);
        return saved;
    }

    @Transactional
    public void deleteExam(Long examId, String adminEmail) {
        Exam exam = getById(examId);

        // Safely cascade delete all related entities in proper foreign key order
        entityManager.createNativeQuery("DELETE FROM warnings WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = :examId)")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM proctoring_events WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = :examId)")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM proctoring_sessions WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = :examId)")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exam_answers WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = :examId)")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exam_attempts WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exam_assignments WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exam_questions WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exams WHERE id = :examId")
                .setParameter("examId", examId).executeUpdate();

        auditLogService.logAdmin(adminEmail, "EXAM_DELETED", "Deleted exam '" + exam.getName() + "' (ID: " + examId + ")");
    }

    public List<ExamAssignment> listAssignments(Long examId) {
        getById(examId);
        return assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId);
    }

    @Transactional
    public void unassignStudent(Long examId, Long assignmentId) {
        ExamAssignment assignment = assignmentRepository.findByIdAndExamId(assignmentId, examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Assignment not found."));
        assignmentRepository.delete(assignment);
        auditLogService.logAdmin("admin", "STUDENT_UNASSIGNED",
                "Unassigned " + assignment.getStudentEmail() + " from exam ID " + examId);
    }

    @Transactional
    public ExamQuestion updateQuestion(Long examId, Long questionId, QuestionRequest req) {
        getById(examId);
        ExamQuestion q = questionRepository.findByIdAndExamId(questionId, examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Question not found."));

        String qType = req.questionType() != null && !req.questionType().isBlank() ? req.questionType().toUpperCase() : q.getQuestionType();
        q.setQuestionType(qType);
        q.setProblemTitle(req.problemTitle());
        q.setQuestionText(req.questionText());
        q.setOptionA(req.optionA());
        q.setOptionB(req.optionB());
        q.setOptionC(req.optionC());
        q.setOptionD(req.optionD());
        q.setCorrectAnswer(req.correctAnswer());
        q.setCodeTemplate(req.codeTemplate());
        if (req.allowedLanguages() != null) {
            q.setAllowedLanguages(req.allowedLanguages());
        }
        q.setConstraints(req.constraints());
        if (req.marks() != null) {
            q.setMarks(req.marks());
        }

        if ("CODING".equals(qType) && req.testCases() != null) {
            q.getTestCases().clear();
            int tcOrder = 0;
            for (com.proctor.exam.dto.TestCaseRequest tcReq : req.testCases()) {
                ExamQuestionTestCase tc = ExamQuestionTestCase.builder()
                        .question(q)
                        .input(tcReq.input() != null ? tcReq.input() : "")
                        .expectedOutput(tcReq.expectedOutput() != null ? tcReq.expectedOutput() : "")
                        .isHidden(Boolean.TRUE.equals(tcReq.isHidden()))
                        .explanation(tcReq.explanation())
                        .displayOrder(tcReq.displayOrder() != null ? tcReq.displayOrder() : tcOrder++)
                        .build();
                q.getTestCases().add(tc);
            }
        }

        ExamQuestion saved = questionRepository.save(q);
        auditLogService.logAdmin("admin", "QUESTION_UPDATED", "Updated question ID " + saved.getId() + " in exam ID " + examId);
        return saved;
    }

    @Transactional
    public void deleteQuestion(Long examId, Long questionId) {
        getById(examId);
        ExamQuestion q = questionRepository.findByIdAndExamId(questionId, examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Question not found."));

        // If answers exist referencing this question, delete them first
        entityManager.createNativeQuery("DELETE FROM exam_answers WHERE question_id = :qid")
                .setParameter("qid", questionId).executeUpdate();

        questionRepository.delete(q);
        auditLogService.logAdmin("admin", "QUESTION_DELETED", "Deleted question ID " + questionId + " from exam ID " + examId);
    }

    private String buildProctoringConfigWithAudio(Integer audioInputLevel) {
        int audioLevel = audioInputLevel != null ? Math.max(1, Math.min(100, audioInputLevel)) : 20;
        String pConfig = Exam.DEFAULT_PROCTORING_CONFIG;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.node.ObjectNode node = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(pConfig);
            node.put("audioInputLevel", audioLevel);
            return mapper.writeValueAsString(node);
        } catch (Exception ignored) {
            return pConfig;
        }
    }
}
