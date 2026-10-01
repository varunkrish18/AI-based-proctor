package com.proctor.exam.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proctor.exam.dto.*;
import com.proctor.exam.entity.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
public class ExamAdminService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ExamRepository examRepository;
    private final ExamQuestionRepository questionRepository;
    private final ExamAssignmentRepository assignmentRepository;
    private final AdminRepository adminRepository;
    private final AuditLogService auditLogService;
    private final jakarta.persistence.EntityManager entityManager;
    private final AiProxyService aiProxyService;
    private final StudentQuestionAssignmentRepository sqaRepository;

    public ExamAdminService(ExamRepository examRepository,
                            ExamQuestionRepository questionRepository,
                            ExamAssignmentRepository assignmentRepository,
                            AdminRepository adminRepository,
                            AuditLogService auditLogService,
                            jakarta.persistence.EntityManager entityManager,
                            AiProxyService aiProxyService,
                            StudentQuestionAssignmentRepository sqaRepository) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.assignmentRepository = assignmentRepository;
        this.adminRepository = adminRepository;
        this.auditLogService = auditLogService;
        this.entityManager = entityManager;
        this.aiProxyService = aiProxyService;
        this.sqaRepository = sqaRepository;
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
        verifyExamAccess(exam, adminEmail);

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

    public void verifyExamAccess(Exam exam, String staffEmail) {
        if (staffEmail == null || staffEmail.isBlank() || exam == null) return;
        Admin admin = adminRepository.findByEmail(staffEmail.toLowerCase()).orElse(null);
        if (admin != null && "EXAMINER".equalsIgnoreCase(admin.getRole())) {
            if (exam.getCreatedBy() == null || !exam.getCreatedBy().equals(admin.getId())) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Access denied: As an Examiner, you can only view and manage exams created by you.");
            }
        }
    }

    public List<Exam> listAll() {
        return examRepository.findAll();
    }

    public List<Exam> listExamsForUser(String staffEmail) {
        if (staffEmail != null && !staffEmail.isBlank()) {
            Admin admin = adminRepository.findByEmail(staffEmail.toLowerCase()).orElse(null);
            if (admin != null && "EXAMINER".equalsIgnoreCase(admin.getRole())) {
                return examRepository.findByCreatedByOrderByCreatedAtDesc(admin.getId());
            }
        }
        return examRepository.findAll();
    }

    public Exam getById(Long id) {
        return examRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found."));
    }

    public Exam getExamForUser(Long id, String staffEmail) {
        Exam exam = getById(id);
        verifyExamAccess(exam, staffEmail);
        return exam;
    }

    @Transactional
    public Exam publish(Long examId, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        long questionCount = questionRepository.countByExamId(examId);
        if (questionCount < exam.getNumQuestions()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Exam has " + questionCount + " question(s) but numQuestions is set to " + exam.getNumQuestions() + ".");
        }
        exam.setStatus("PUBLISHED");
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "EXAM_PUBLISHED", "Published exam ID " + examId + " ('" + saved.getName() + "')");
        return saved;
    }

    @Transactional
    public Exam publish(Long examId) {
        return publish(examId, "admin");
    }

    @Transactional
    public ExamQuestion addQuestion(Long examId, QuestionRequest req, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
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
                .allowedLanguages(req.allowedLanguages() != null ? req.allowedLanguages() : "c,python,java")
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
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "QUESTION_ADDED", "Added " + qType + " question ID " + saved.getId() + " to exam ID " + examId);
        return saved;
    }

    @Transactional
    public ExamQuestion addQuestion(Long examId, QuestionRequest req) {
        return addQuestion(examId, req, "admin");
    }

    @Transactional
    public List<ExamQuestion> generateAndAddAiQuestions(Long examId, AiGenerateQuestionsRequest req, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);

        int countToGenerate = req.numQuestions() != null ? req.numQuestions() : 5;
        String qType = req.questionType() != null && !req.questionType().isBlank() ? req.questionType().trim() : "MIXED";
        String difficulty = req.difficulty() != null && !req.difficulty().isBlank() ? req.difficulty().trim() : "Medium";

        List<Map<String, Object>> aiQuestions = aiProxyService.generateExamQuestions(
                req.topics(),
                countToGenerate,
                qType,
                difficulty
        );

        if (aiQuestions == null || aiQuestions.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "No questions were generated by the AI service.");
        }

        long currentCount = questionRepository.countByExamId(examId);
        int totalNeeded = (int) currentCount + aiQuestions.size();
        if (totalNeeded > exam.getNumQuestions()) {
            exam.setNumQuestions(totalNeeded);
            examRepository.save(exam);
        }

        List<ExamQuestion> addedQuestions = new ArrayList<>();

        for (Map<String, Object> qMap : aiQuestions) {
            String itemType = qMap.get("questionType") != null ? qMap.get("questionType").toString().toUpperCase() : "MCQ";
            String questionText = qMap.get("questionText") != null ? qMap.get("questionText").toString() : "";
            BigDecimal marks = BigDecimal.valueOf(1);
            if (qMap.get("marks") instanceof Number num) {
                marks = BigDecimal.valueOf(num.doubleValue());
            }

            if ("CODING".equals(itemType)) {
                String title = qMap.get("problemTitle") != null ? qMap.get("problemTitle").toString() : "Coding Problem";
                String constraints = qMap.get("constraints") != null ? qMap.get("constraints").toString() : "1 <= N <= 10^5\nTime Limit: 2.0s";
                String allowedLanguages = qMap.get("allowedLanguages") != null ? qMap.get("allowedLanguages").toString() : "c,python,java";
                String codeTemplate = qMap.get("codeTemplate") != null ? qMap.get("codeTemplate").toString() : "import sys\n\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()";

                List<TestCaseRequest> testCaseRequests = new ArrayList<>();
                if (qMap.get("testCases") instanceof List<?> tcList) {
                    int tcIdx = 0;
                    for (Object tcObj : tcList) {
                        if (tcObj instanceof Map<?, ?> tcMap) {
                            String in = tcMap.get("input") != null ? tcMap.get("input").toString() : "";
                            String out = tcMap.get("expectedOutput") != null ? tcMap.get("expectedOutput").toString() : "";
                            Boolean isHidden = Boolean.TRUE.equals(tcMap.get("isHidden"));
                            String exp = tcMap.get("explanation") != null ? tcMap.get("explanation").toString() : "";
                            testCaseRequests.add(new TestCaseRequest(null, in, out, isHidden, exp, tcIdx++));
                        }
                    }
                }
                if (testCaseRequests.isEmpty()) {
                    testCaseRequests.add(new TestCaseRequest(null, "1", "1", false, "Sample Case", 0));
                    testCaseRequests.add(new TestCaseRequest(null, "2", "2", true, "Hidden Case", 1));
                }

                QuestionRequest qReq = new QuestionRequest(
                        "CODING",
                        questionText,
                        null, null, null, null,
                        null,
                        marks.compareTo(BigDecimal.ONE) == 0 ? BigDecimal.valueOf(10) : marks,
                        title,
                        constraints,
                        codeTemplate,
                        allowedLanguages,
                        testCaseRequests
                );
                addedQuestions.add(addQuestion(examId, qReq, adminEmail));
            } else {
                String optA = qMap.get("optionA") != null ? qMap.get("optionA").toString() : "Option A";
                String optB = qMap.get("optionB") != null ? qMap.get("optionB").toString() : "Option B";
                String optC = qMap.get("optionC") != null ? qMap.get("optionC").toString() : "Option C";
                String optD = qMap.get("optionD") != null ? qMap.get("optionD").toString() : "Option D";
                Short correctAns = 0;
                if (qMap.get("correctAnswer") instanceof Number num) {
                    correctAns = num.shortValue();
                }

                QuestionRequest qReq = new QuestionRequest(
                        "MCQ",
                        questionText,
                        optA, optB, optC, optD,
                        correctAns,
                        marks,
                        null, null, null, null,
                        List.of()
                );
                addedQuestions.add(addQuestion(examId, qReq, adminEmail));
            }
        }

        auditLogService.logAdmin(
                adminEmail != null ? adminEmail : "admin",
                "AI_QUESTIONS_GENERATED",
                "Generated and attached " + addedQuestions.size() + " AI questions to exam '" + exam.getName() + "' (ID: " + examId + ")"
        );

        return addedQuestions;
    }


    @Transactional
    public Exam updateNumQuestions(Long examId, int numQuestions, String adminEmail) {
        if (numQuestions <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "numQuestions must be greater than 0.");
        }
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        exam.setNumQuestions(numQuestions);
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "EXAM_LIMIT_UPDATED",
                "Updated question limit to " + numQuestions + " for exam ID " + examId);
        return saved;
    }

    @Transactional
    public Exam updateNumQuestions(Long examId, int numQuestions) {
        return updateNumQuestions(examId, numQuestions, "admin");
    }

    public List<ExamQuestion> listQuestions(Long examId, String staffEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, staffEmail);
        return questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
    }

    public List<ExamQuestion> listQuestions(Long examId) {
        return listQuestions(examId, null);
    }

    private String generateRandomPassword(int length) {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        java.security.SecureRandom random = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    @Transactional
    public Map<String, Object> assignStudents(Long examId, AssignStudentsRequest req, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        int assigned = 0;
        int skipped = 0;
        List<Map<String, String>> credentials = new ArrayList<>();
        for (String rawEmail : req.emails()) {
            String email = rawEmail.trim().toLowerCase();
            if (email.isBlank()) continue;
            java.util.Optional<ExamAssignment> existing = assignmentRepository.findByExamIdAndStudentEmailIgnoreCase(examId, email);
            if (existing.isEmpty()) {
                String pwd = generateRandomPassword(8);
                ExamAssignment assignment = ExamAssignment.builder()
                        .exam(exam)
                        .studentEmail(email)
                        .accessPassword(pwd)
                        .build();
                assignmentRepository.save(assignment);
                assigned++;
                credentials.add(Map.of("email", email, "password", pwd));
            } else {
                ExamAssignment current = existing.get();
                String pwd = current.getAccessPassword();
                if (pwd == null || pwd.isBlank()) {
                    pwd = generateRandomPassword(8);
                    current.setAccessPassword(pwd);
                    assignmentRepository.save(current);
                }
                credentials.add(Map.of("email", email, "password", pwd));
                skipped++;
            }
        }
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "STUDENTS_ASSIGNED", "Assigned " + assigned + " new student(s) to exam ID " + examId);
        return Map.of("assigned", assigned, "skipped", skipped, "credentials", credentials);
    }

    @Transactional
    public Map<String, Object> assignStudents(Long examId, AssignStudentsRequest req) {
        return assignStudents(examId, req, "admin");
    }

    @Transactional
    public Exam setOpenToAll(Long examId, boolean openToAll, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        exam.setOpenToAll(openToAll);
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "EXAM_OPEN_TO_ALL_UPDATED",
                "Updated open-to-all status to " + openToAll + " for exam ID " + examId);
        return saved;
    }

    @Transactional
    public Exam setOpenToAll(Long examId, boolean openToAll) {
        return setOpenToAll(examId, openToAll, "admin");
    }

    @Transactional
    public void deleteExam(Long examId, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);

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
        entityManager.createNativeQuery("DELETE FROM student_question_assignments WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exam_assignments WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exam_questions WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM exams WHERE id = :examId")
                .setParameter("examId", examId).executeUpdate();

        auditLogService.logAdmin(adminEmail, "EXAM_DELETED", "Deleted exam '" + exam.getName() + "' (ID: " + examId + ")");
    }

    public List<ExamAssignment> listAssignments(Long examId, String staffEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, staffEmail);
        List<ExamAssignment> list = assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId);
        for (ExamAssignment a : list) {
            if (a.getAccessPassword() == null || a.getAccessPassword().isBlank()) {
                a.setAccessPassword(generateRandomPassword(8));
                assignmentRepository.save(a);
            }
        }
        return list;
    }

    public List<ExamAssignment> listAssignments(Long examId) {
        return listAssignments(examId, null);
    }

    @Transactional
    public void unassignStudent(Long examId, Long assignmentId, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        ExamAssignment assignment = assignmentRepository.findByIdAndExamId(assignmentId, examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Assignment not found."));
        assignmentRepository.delete(assignment);
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "STUDENT_UNASSIGNED",
                "Unassigned " + assignment.getStudentEmail() + " from exam ID " + examId);
    }

    @Transactional
    public void unassignStudent(Long examId, Long assignmentId) {
        unassignStudent(examId, assignmentId, "admin");
    }

    @Transactional
    public ExamQuestion updateQuestion(Long examId, Long questionId, QuestionRequest req, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
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
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "QUESTION_UPDATED", "Updated question ID " + saved.getId() + " in exam ID " + examId);
        return saved;
    }

    @Transactional
    public ExamQuestion updateQuestion(Long examId, Long questionId, QuestionRequest req) {
        return updateQuestion(examId, questionId, req, "admin");
    }

    @Transactional
    public void deleteQuestion(Long examId, Long questionId, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        ExamQuestion q = questionRepository.findByIdAndExamId(questionId, examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Question not found."));

        // If answers exist referencing this question, delete them first
        entityManager.createNativeQuery("DELETE FROM exam_answers WHERE question_id = :qid")
                .setParameter("qid", questionId).executeUpdate();

        questionRepository.delete(q);
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "QUESTION_DELETED", "Deleted question ID " + questionId + " from exam ID " + examId);
    }

    @Transactional
    public void deleteQuestion(Long examId, Long questionId) {
        deleteQuestion(examId, questionId, "admin");
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

    // -------------------------------------------------------------------------
    // Random per-student question assignment
    // -------------------------------------------------------------------------

    /**
     * Randomly assigns {@code questionsPerStudent} questions from the exam's question
     * bank to each assigned student.  Existing assignments are overwritten.
     *
     * @return the full report so the frontend can display it immediately after assigning
     */
    @Transactional
    public QuestionAssignmentReportResponse assignQuestionsRandomly(
            Long examId, int questionsPerStudent, String adminEmail) {

        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);

        List<ExamQuestion> bank = questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
        if (bank.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "No questions found for exam ID " + examId + ". Generate or add questions first.");
        }
        if (questionsPerStudent <= 0 || questionsPerStudent > bank.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "questionsPerStudent must be between 1 and the total question count (" + bank.size() + ").");
        }

        List<ExamAssignment> enrolled = assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId);
        if (enrolled.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "No students are assigned to exam ID " + examId + ". Assign students first.");
        }

        // Clear previous random assignments for this exam
        sqaRepository.deleteByExamId(examId);

        List<StudentQuestionAssignmentEntry> entries = new ArrayList<>();
        Random rng = new Random();

        for (ExamAssignment enrollment : enrolled) {
            // Shuffle a copy and take the first N
            List<ExamQuestion> shuffled = new ArrayList<>(bank);
            Collections.shuffle(shuffled, rng);
            List<ExamQuestion> chosen = shuffled.subList(0, questionsPerStudent);

            List<Long> chosenIds = chosen.stream().map(ExamQuestion::getId).toList();
            String idsJson;
            try {
                idsJson = MAPPER.writeValueAsString(chosenIds);
            } catch (Exception e) {
                idsJson = chosenIds.toString();
            }

            StudentQuestionAssignment sqa = StudentQuestionAssignment.builder()
                    .exam(exam)
                    .studentEmail(enrollment.getStudentEmail())
                    .questionIds(idsJson)
                    .questionsPerStudent(questionsPerStudent)
                    .build();
            sqaRepository.save(sqa);

            List<AssignedQuestionSummary> summaries = chosen.stream()
                    .map(q -> new AssignedQuestionSummary(
                            q.getId(),
                            q.getDisplayOrder(),
                            q.getQuestionType(),
                            truncate(q.getQuestionText(), 120),
                            q.getProblemTitle()
                    ))
                    .toList();

            entries.add(new StudentQuestionAssignmentEntry(
                    enrollment.getStudentEmail(), summaries, sqa.getAssignedAt()));
        }

        auditLogService.logAdmin(
                adminEmail != null ? adminEmail : "admin",
                "QUESTIONS_RANDOMLY_ASSIGNED",
                "Assigned " + questionsPerStudent + " random question(s) to " + enrolled.size()
                        + " student(s) for exam '" + exam.getName() + "' (ID: " + examId + ")"
        );

        return new QuestionAssignmentReportResponse(
                examId, exam.getName(), bank.size(), questionsPerStudent,
                enrolled.size(), entries);
    }

    /**
     * Returns the existing question-assignment report for an exam (read-only).
     */
    @Transactional(readOnly = true)
    public QuestionAssignmentReportResponse getQuestionAssignmentReport(
            Long examId, String adminEmail) {

        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);

        List<ExamQuestion> bank = questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
        Map<Long, ExamQuestion> byId = new HashMap<>();
        bank.forEach(q -> byId.put(q.getId(), q));

        List<StudentQuestionAssignment> sqas =
                sqaRepository.findByExamIdOrderByStudentEmailAsc(examId);

        int qps = sqas.isEmpty() ? 0 : sqas.get(0).getQuestionsPerStudent();

        List<StudentQuestionAssignmentEntry> entries = new ArrayList<>();
        for (StudentQuestionAssignment sqa : sqas) {
            List<Long> ids;
            try {
                ids = MAPPER.readValue(sqa.getQuestionIds(),
                        new TypeReference<List<Long>>() {});
            } catch (Exception e) {
                ids = List.of();
            }

            List<AssignedQuestionSummary> summaries = ids.stream()
                    .map(qid -> {
                        ExamQuestion q = byId.get(qid);
                        if (q == null) return null;
                        return new AssignedQuestionSummary(
                                q.getId(),
                                q.getDisplayOrder(),
                                q.getQuestionType(),
                                truncate(q.getQuestionText(), 120),
                                q.getProblemTitle()
                        );
                    })
                    .filter(Objects::nonNull)
                    .toList();

            entries.add(new StudentQuestionAssignmentEntry(
                    sqa.getStudentEmail(), summaries, sqa.getAssignedAt()));
        }

        return new QuestionAssignmentReportResponse(
                examId, exam.getName(), bank.size(), qps, entries.size(), entries);
    }

    private static String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "…";
    }
}
