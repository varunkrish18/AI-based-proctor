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
import java.util.stream.Collectors;

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
    private final ExamAttemptRepository examAttemptRepository;
    private final ProfessorRepository professorRepository;
    private final StudentRepository studentRepository;
    private final ExamAnswerRepository answerRepository;

    public ExamAdminService(ExamRepository examRepository,
                            ExamQuestionRepository questionRepository,
                            ExamAssignmentRepository assignmentRepository,
                            AdminRepository adminRepository,
                            AuditLogService auditLogService,
                            jakarta.persistence.EntityManager entityManager,
                            AiProxyService aiProxyService,
                            StudentQuestionAssignmentRepository sqaRepository,
                            ExamAttemptRepository examAttemptRepository,
                            ProfessorRepository professorRepository,
                            StudentRepository studentRepository,
                            ExamAnswerRepository answerRepository) {
        this.examRepository = examRepository;
        this.questionRepository = questionRepository;
        this.assignmentRepository = assignmentRepository;
        this.adminRepository = adminRepository;
        this.auditLogService = auditLogService;
        this.entityManager = entityManager;
        this.aiProxyService = aiProxyService;
        this.sqaRepository = sqaRepository;
        this.examAttemptRepository = examAttemptRepository;
        this.professorRepository = professorRepository;
        this.studentRepository = studentRepository;
        this.answerRepository = answerRepository;
    }

    @Transactional
    public Exam createExam(CreateExamRequest req, String adminEmail) {
        if (!req.endAt().isAfter(req.startAt())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "endAt must be after startAt.");
        }
        Admin admin = adminRepository.findByEmail(adminEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Admin not found."));

        Long profId = req.assignedProfessorId();
        String profEmail = req.assignedProfessorEmail();
        String profName = req.assignedProfessorName();

        if (profId != null && (profEmail == null || profEmail.isBlank() || profName == null || profName.isBlank())) {
            Professor p = professorRepository.findById(profId).orElse(null);
            if (p != null) {
                profEmail = p.getEmail();
                profName = p.getFullName();
            } else {
                Admin a = adminRepository.findById(profId).orElse(null);
                if (a != null) {
                    profEmail = a.getEmail();
                    profName = a.getFullName();
                }
            }
        } else if (profEmail != null && !profEmail.isBlank() && (profName == null || profName.isBlank() || profId == null)) {
            Professor p = professorRepository.findByEmailIgnoreCase(profEmail.trim()).orElse(null);
            if (p != null) {
                if (profId == null) profId = p.getId();
                if (profName == null || profName.isBlank()) profName = p.getFullName();
            } else {
                Admin a = adminRepository.findByEmail(profEmail.trim().toLowerCase()).orElse(null);
                if (a != null) {
                    if (profId == null) profId = a.getId();
                    if (profName == null || profName.isBlank()) profName = a.getFullName();
                }
            }
        }

        boolean isClassMode = Boolean.TRUE.equals(req.isClass()) || "COURSE_COORDINATOR".equalsIgnoreCase(admin.getRole());

        Integer effectiveMaxAttempts = isClassMode ? null : req.maxAttempts();

        Exam exam = Exam.builder()
                .name(req.name())
                .description(req.description())
                .subject(req.subject())
                .durationMinutes(req.durationMinutes())
                .startAt(req.startAt())
                .endAt(req.endAt())
                .numQuestions(req.numQuestions())
                .passingMarks(req.passingMarks())
                .negativeMarking(req.negativeMarking())
                .randomizeQuestions(req.randomizeQuestions() == null || req.randomizeQuestions())
                .randomizeOptions(req.randomizeOptions() == null || req.randomizeOptions())
                .maxAttempts(effectiveMaxAttempts)
                .webcamRequired(req.webcamRequired() == null || req.webcamRequired())
                .microphoneRequired(req.microphoneRequired() == null || req.microphoneRequired())
                .screenRequired(req.screenRequired() == null || req.screenRequired())
                .locationRequired(Boolean.TRUE.equals(req.locationRequired()))
                .proctoringConfig(buildProctoringConfigWithAudio(req.audioInputLevel()))
                .status("DRAFT")
                .createdBy(admin.getId())
                .assignedProfessorId(profId)
                .assignedProfessorEmail(profEmail != null ? profEmail.trim() : null)
                .assignedProfessorName(profName != null ? profName.trim() : null)
                .isClass(isClassMode)
                .build();
        Exam saved = examRepository.save(exam);
        auditLogService.logAdmin(adminEmail, "EXAM_CREATED", "Created exam '" + saved.getName() + "' (ID: " + saved.getId() + ")");
        return saved;
    }

    @Transactional
    public Exam updateExam(Long examId, UpdateExamRequest req, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        checkClassSettingModificationAllowed(exam, adminEmail);

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
        if (Boolean.TRUE.equals(exam.getIsClass()) || Boolean.TRUE.equals(req.isClass())) {
            exam.setMaxAttempts(null);
        } else if (req.maxAttempts() != null) {
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
        if (req.isClass() != null) {
            exam.setIsClass(req.isClass());
        }
        if (req.assignedProfessorId() != null || req.assignedProfessorEmail() != null) {
            Long pId = req.assignedProfessorId();
            String pEmail = req.assignedProfessorEmail();
            String pName = req.assignedProfessorName();
            if (pId != null && (pEmail == null || pEmail.isBlank())) {
                Professor p = professorRepository.findById(pId).orElse(null);
                if (p != null) {
                    pEmail = p.getEmail();
                    pName = p.getFullName();
                }
            } else if (pEmail != null && !pEmail.isBlank() && pId == null) {
                Professor p = professorRepository.findByEmailIgnoreCase(pEmail.trim()).orElse(null);
                if (p != null) {
                    pId = p.getId();
                    if (pName == null || pName.isBlank()) pName = p.getFullName();
                }
            }
            exam.setAssignedProfessorId(pId);
            exam.setAssignedProfessorEmail(pEmail);
            if (pName != null && !pName.isBlank()) {
                exam.setAssignedProfessorName(pName);
            }
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

    @Transactional
    public Exam assignProfessor(Long examId, AssignProfessorRequest req, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        checkClassSettingModificationAllowed(exam, adminEmail);

        Long profId = req.professorId();
        String profEmail = req.professorEmail();
        String profName = req.professorName();

        if (profId != null && (profEmail == null || profEmail.isBlank() || profName == null || profName.isBlank())) {
            Professor p = professorRepository.findById(profId).orElse(null);
            if (p != null) {
                profEmail = p.getEmail();
                profName = p.getFullName();
            } else {
                Admin a = adminRepository.findById(profId).orElse(null);
                if (a != null) {
                    profEmail = a.getEmail();
                    profName = a.getFullName();
                }
            }
        } else if (profEmail != null && !profEmail.isBlank() && (profName == null || profName.isBlank() || profId == null)) {
            Professor p = professorRepository.findByEmailIgnoreCase(profEmail.trim()).orElse(null);
            if (p != null) {
                if (profId == null) profId = p.getId();
                if (profName == null || profName.isBlank()) profName = p.getFullName();
            } else {
                Admin a = adminRepository.findByEmail(profEmail.trim().toLowerCase()).orElse(null);
                if (a != null) {
                    if (profId == null) profId = a.getId();
                    if (profName == null || profName.isBlank()) profName = a.getFullName();
                }
            }
        }

        exam.setAssignedProfessorId(profId);
        exam.setAssignedProfessorEmail(profEmail != null ? profEmail.trim() : null);
        exam.setAssignedProfessorName(profName != null ? profName.trim() : null);
        exam.setUpdatedAt(Instant.now());
        Exam saved = examRepository.save(exam);

        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "PROFESSOR_ASSIGNED",
                "Assigned professor '" + (profName != null ? profName : "ID: " + profId) + "' to class/exam '" + saved.getName() + "' (ID: " + examId + ")");
        return saved;
    }

    public void verifyExamAccess(Exam exam, String staffEmail) {
        if (staffEmail == null || staffEmail.isBlank() || exam == null) return;
        String email = staffEmail.trim().toLowerCase();
        Admin admin = adminRepository.findByEmail(email).orElse(null);
        Professor prof = professorRepository.findByEmailIgnoreCase(email).orElse(null);

        boolean isProfessorRole = (admin != null && ("EXAMINER".equalsIgnoreCase(admin.getRole()) || "FACULTY".equalsIgnoreCase(admin.getRole()) || "PROFESSOR".equalsIgnoreCase(admin.getRole())))
                || (prof != null);

        if (isProfessorRole) {
            Long adminId = admin != null ? admin.getId() : null;
            Long profEntityId = prof != null ? prof.getId() : null;

            boolean isCreator = adminId != null && exam.getCreatedBy() != null && exam.getCreatedBy().equals(adminId);
            boolean isAssignedByEmail = exam.getAssignedProfessorEmail() != null && exam.getAssignedProfessorEmail().equalsIgnoreCase(email);
            boolean isAssignedById = exam.getAssignedProfessorId() != null &&
                    ((adminId != null && exam.getAssignedProfessorId().equals(adminId)) || (profEntityId != null && exam.getAssignedProfessorId().equals(profEntityId)));

            if (!isCreator && !isAssignedByEmail && !isAssignedById) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Access denied: As a Professor / Faculty, you can only view and manage exams assigned to or created by you.");
            }
        } else if (admin != null && "COURSE_COORDINATOR".equalsIgnoreCase(admin.getRole())) {
            if (exam.getCreatedBy() != null && !exam.getCreatedBy().equals(admin.getId())) {
                Admin creator = adminRepository.findById(exam.getCreatedBy()).orElse(null);
                if (creator == null || creator.getDepartment() == null || !creator.getDepartment().equalsIgnoreCase(admin.getDepartment())) {
                    // Also check if assigned professor is in coordinator's department
                    boolean inSameDept = false;
                    if (exam.getAssignedProfessorEmail() != null) {
                        Professor p = professorRepository.findByEmailIgnoreCase(exam.getAssignedProfessorEmail()).orElse(null);
                        if (p != null && admin.getDepartment().equalsIgnoreCase(p.getDepartment())) {
                            inSameDept = true;
                        }
                    }
                    if (!inSameDept) {
                        throw new ApiException(HttpStatus.FORBIDDEN,
                                "Access denied: As a Course Coordinator, you can only access exams within your department.");
                    }
                }
            }
        }
    }

    public boolean isProfessorUser(String staffEmail) {
        if (staffEmail == null || staffEmail.isBlank()) return false;
        String email = staffEmail.trim().toLowerCase();
        Admin admin = adminRepository.findByEmail(email).orElse(null);
        Professor prof = professorRepository.findByEmailIgnoreCase(email).orElse(null);
        return (admin != null && ("EXAMINER".equalsIgnoreCase(admin.getRole()) || "FACULTY".equalsIgnoreCase(admin.getRole()) || "PROFESSOR".equalsIgnoreCase(admin.getRole())))
                || (prof != null);
    }

    public record ProfessorSummary(Long id, String email, String fullName, String department) {}

    public List<ProfessorSummary> findAllProfessorsInDepartment(String dept) {
        Map<String, ProfessorSummary> profMap = new LinkedHashMap<>();

        // 1. From professorRepository
        List<Professor> pList = professorRepository.findAll();
        for (Professor p : pList) {
            if (dept == null || dept.isBlank() || "ALL".equalsIgnoreCase(dept)
                    || (p.getDepartment() != null && dept.equalsIgnoreCase(p.getDepartment()))) {
                if (p.getEmail() != null && !p.getEmail().isBlank()) {
                    profMap.put(p.getEmail().toLowerCase().trim(),
                            new ProfessorSummary(p.getId(), p.getEmail().trim(), p.getFullName(), p.getDepartment()));
                }
            }
        }

        // 2. From adminRepository (users with role PROFESSOR, FACULTY, EXAMINER)
        List<Admin> aList = adminRepository.findAll();
        for (Admin a : aList) {
            String role = a.getRole() != null ? a.getRole().toUpperCase() : "";
            if (List.of("PROFESSOR", "FACULTY", "EXAMINER").contains(role)) {
                if (dept == null || dept.isBlank() || "ALL".equalsIgnoreCase(dept)
                        || (a.getDepartment() != null && dept.equalsIgnoreCase(a.getDepartment()))) {
                    if (a.getEmail() != null && !a.getEmail().isBlank()) {
                        String key = a.getEmail().toLowerCase().trim();
                        if (!profMap.containsKey(key)) {
                            profMap.put(key, new ProfessorSummary(a.getId(), a.getEmail().trim(), a.getFullName(), a.getDepartment()));
                        }
                    }
                }
            }
        }

        return new ArrayList<>(profMap.values());
    }

    @Transactional
    public List<Exam> assignAllProfessors(Long examId, String adminEmail) {
        Exam baseExam = getById(examId);
        verifyExamAccess(baseExam, adminEmail);
        checkClassSettingModificationAllowed(baseExam, adminEmail);

        String dept = null;
        if (adminEmail != null && !adminEmail.isBlank()) {
            Admin admin = adminRepository.findByEmail(adminEmail.trim().toLowerCase()).orElse(null);
            if (admin != null) {
                dept = admin.getDepartment();
            }
        }
        if (dept == null || dept.isBlank()) {
            dept = baseExam.getSubject();
        }

        List<ProfessorSummary> profs = findAllProfessorsInDepartment(dept);
        if (profs.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No professors or faculty members found in department: " + (dept != null ? dept : "any"));
        }

        List<Exam> resultList = new ArrayList<>();
        List<ExamQuestion> baseQuestions = questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);

        // Keep the base class intact as the single unified class
        baseExam.setIsClass(true);
        baseExam.setMaxAttempts(null);
        baseExam.setUpdatedAt(Instant.now());

        // Assign primary professor if not yet assigned
        if (baseExam.getAssignedProfessorEmail() == null || baseExam.getAssignedProfessorEmail().isBlank()) {
            ProfessorSummary firstProf = profs.get(0);
            baseExam.setAssignedProfessorId(firstProf.id());
            baseExam.setAssignedProfessorEmail(firstProf.email());
            baseExam.setAssignedProfessorName(firstProf.fullName());
        }

        Exam savedBase = examRepository.save(baseExam);
        resultList.add(savedBase);

        auditLogService.logAdmin(adminEmail, "ALL_PROFESSORS_ASSIGNED",
                "Assigned all " + profs.size() + " professors in department '" + dept + "' to class '" + baseExam.getName() + "' (Single class maintained, no cloning)");
        return resultList;
    }

    public void checkClassSettingModificationAllowed(Exam exam, String staffEmail) {
        if (exam == null || staffEmail == null || staffEmail.isBlank()) return;
        if (isProfessorUser(staffEmail)) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Access denied: Exam configuration, settings, question limits, and schedule timing are completely locked for professors. Modifications can only be performed by the Course Coordinator or Administrator.");
        }
    }

    public void checkQuestionModificationAllowed(Exam exam, ExamQuestion q, String staffEmail) {
        if (staffEmail == null || staffEmail.isBlank() || q == null) return;
        if (isProfessorUser(staffEmail)) {
            boolean isCoordinatorQuestion = Boolean.TRUE.equals(q.getCreatedByCoordinator())
                    || "COURSE_COORDINATOR".equalsIgnoreCase(q.getCreatedByRole());

            if (!isCoordinatorQuestion && exam != null && exam.getCreatedBy() != null) {
                Admin examCreator = adminRepository.findById(exam.getCreatedBy()).orElse(null);
                if (examCreator != null && "COURSE_COORDINATOR".equalsIgnoreCase(examCreator.getRole())) {
                    String email = staffEmail.trim().toLowerCase();
                    Admin callerAdmin = adminRepository.findByEmail(email).orElse(null);
                    Professor callerProf = professorRepository.findByEmailIgnoreCase(email).orElse(null);
                    Long callerId = callerProf != null ? callerProf.getId() : (callerAdmin != null ? callerAdmin.getId() : null);
                    if (q.getCreatedBy() == null || !q.getCreatedBy().equals(callerId) || !"PROFESSOR".equalsIgnoreCase(q.getCreatedByRole())) {
                        isCoordinatorQuestion = true;
                    }
                }
            }

            if (isCoordinatorQuestion) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Access denied: As an assigned Professor, you cannot edit or delete questions provided by the Course Coordinator. You can only edit or delete questions you added.");
            }
        }
    }

    public List<Exam> listAll() {
        return examRepository.findAll();
    }

    public List<Exam> listExamsForUser(String staffEmail) {
        if (staffEmail != null && !staffEmail.isBlank()) {
            String email = staffEmail.trim().toLowerCase();
            Admin admin = adminRepository.findByEmail(email).orElse(null);
            Professor prof = professorRepository.findByEmailIgnoreCase(email).orElse(null);

            boolean isProfessorRole = (admin != null && ("EXAMINER".equalsIgnoreCase(admin.getRole()) || "FACULTY".equalsIgnoreCase(admin.getRole()) || "PROFESSOR".equalsIgnoreCase(admin.getRole())))
                    || (prof != null);

            if (isProfessorRole) {
                Long profEntityId = prof != null ? prof.getId() : null;
                Long adminId = admin != null ? admin.getId() : null;

                return examRepository.findAll().stream()
                        .filter(e -> (adminId != null && e.getCreatedBy() != null && e.getCreatedBy().equals(adminId))
                                || (e.getAssignedProfessorEmail() != null && e.getAssignedProfessorEmail().equalsIgnoreCase(email))
                                || (e.getAssignedProfessorId() != null && ((adminId != null && e.getAssignedProfessorId().equals(adminId)) || (profEntityId != null && e.getAssignedProfessorId().equals(profEntityId)))))
                        .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                        .toList();
            } else if (admin != null && "COURSE_COORDINATOR".equalsIgnoreCase(admin.getRole())) {
                String dept = admin.getDepartment();
                if (dept != null && !dept.isBlank()) {
                    List<Long> deptStaffIds = adminRepository.findAll().stream()
                            .filter(u -> dept.equalsIgnoreCase(u.getDepartment()))
                            .map(Admin::getId)
                            .toList();
                    return examRepository.findAll().stream()
                            .filter(e -> (e.getCreatedBy() != null && (deptStaffIds.contains(e.getCreatedBy()) || e.getCreatedBy().equals(admin.getId())))
                                    || (e.getSubject() != null && e.getSubject().equalsIgnoreCase(dept))
                                    || (e.getAssignedProfessorEmail() != null && isProfessorInDept(e.getAssignedProfessorEmail(), dept)))
                            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                            .toList();
                }
                return examRepository.findByCreatedByOrderByCreatedAtDesc(admin.getId());
            }
        }
        return examRepository.findAll();
    }

    private boolean isProfessorInDept(String email, String dept) {
        if (email == null || dept == null) return false;
        Professor p = professorRepository.findByEmailIgnoreCase(email).orElse(null);
        if (p != null && dept.equalsIgnoreCase(p.getDepartment())) return true;
        Admin a = adminRepository.findByEmail(email.toLowerCase()).orElse(null);
        return a != null && dept.equalsIgnoreCase(a.getDepartment());
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
        checkClassSettingModificationAllowed(exam, adminEmail);
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
        int maxQ = exam.getNumQuestions() != null ? exam.getNumQuestions() : 0;
        if (currentCount >= maxQ) {
            if (Boolean.TRUE.equals(exam.getIsClass())) {
                exam.setNumQuestions((int) currentCount + 1);
                examRepository.save(exam);
            } else {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Exam question limit reached (" + maxQ + " max questions). Increase the exam question limit or delete an existing question.");
            }
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

        Long creatorId = null;
        String creatorRole = "PROFESSOR";
        boolean coordinatorFlag = false;

        if (adminEmail != null && !adminEmail.isBlank()) {
            String email = adminEmail.trim().toLowerCase();
            Admin callerAdmin = adminRepository.findByEmail(email).orElse(null);
            Professor callerProf = professorRepository.findByEmailIgnoreCase(email).orElse(null);
            if (callerAdmin != null) {
                creatorId = callerAdmin.getId();
                creatorRole = callerAdmin.getRole() != null ? callerAdmin.getRole().toUpperCase() : "ADMIN";
                if ("COURSE_COORDINATOR".equalsIgnoreCase(callerAdmin.getRole())) {
                    coordinatorFlag = true;
                }
            } else if (callerProf != null) {
                creatorId = callerProf.getId();
                creatorRole = "PROFESSOR";
                coordinatorFlag = false;
            }
        }

        if (!coordinatorFlag && !isProfessorUser(adminEmail) && exam.getCreatedBy() != null) {
            Admin examCreator = adminRepository.findById(exam.getCreatedBy()).orElse(null);
            if (examCreator != null && "COURSE_COORDINATOR".equalsIgnoreCase(examCreator.getRole())) {
                coordinatorFlag = true;
                if (creatorRole == null || "PROFESSOR".equals(creatorRole)) {
                    creatorRole = "COURSE_COORDINATOR";
                }
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
                .createdBy(creatorId)
                .createdByRole(creatorRole)
                .createdByCoordinator(coordinatorFlag)
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
    public List<ExamQuestion> addQuestionsBulk(Long examId, List<QuestionRequest> requests, String adminEmail) {
        if (requests == null || requests.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No questions provided in bulk upload.");
        }
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);

        long currentCount = questionRepository.countByExamId(examId);
        int totalNeeded = (int) currentCount + requests.size();
        if (totalNeeded > exam.getNumQuestions()) {
            exam.setNumQuestions(totalNeeded);
            examRepository.save(exam);
        }

        List<ExamQuestion> created = new ArrayList<>();
        for (QuestionRequest req : requests) {
            created.add(addQuestion(examId, req, adminEmail));
        }
        auditLogService.logAdmin(adminEmail != null ? adminEmail : "admin", "QUESTIONS_BULK_UPLOAD",
                "Bulk uploaded " + created.size() + " questions to exam ID " + examId);
        return created;
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
        checkClassSettingModificationAllowed(exam, adminEmail);
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
        checkClassSettingModificationAllowed(exam, adminEmail);
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
        checkClassSettingModificationAllowed(exam, adminEmail);

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
        checkQuestionModificationAllowed(exam, q, adminEmail);

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
        checkQuestionModificationAllowed(exam, q, adminEmail);

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
        return assignQuestionsRandomly(examId, questionsPerStudent, null, adminEmail);
    }

    @Transactional
    public QuestionAssignmentReportResponse assignQuestionsRandomly(
            Long examId, int questionsPerStudent, Integer studentCount, String adminEmail) {

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

        // Synchronize exam question limit so ANY student who enters the exam automatically
        // receives exactly questionsPerStudent random questions from the question bank
        if (exam.getNumQuestions() == null || exam.getNumQuestions() != questionsPerStudent) {
            exam.setNumQuestions(questionsPerStudent);
            examRepository.save(exam);
        }

        List<ExamAssignment> enrolled;

        if (exam.isOpenToAll()) {
            // For an Open-to-All exam, whoever enters the exam automatically receives
            // the configured random questions. Clean up any dummy candidate seats.
            entityManager.createNativeQuery("DELETE FROM exam_assignments WHERE exam_id = :examId AND student_email LIKE 'candidate%@student.campus-notes.in'")
                    .setParameter("examId", examId).executeUpdate();
            entityManager.flush();

            // Check if any real students have already verified/joined this open exam
            List<ExamAssignment> rawEnrolled = assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId);
            Map<String, ExamAssignment> enrolledMap = new LinkedHashMap<>();
            for (ExamAssignment a : rawEnrolled) {
                if (a.getStudentEmail() != null && !a.getStudentEmail().isBlank()
                        && !a.getStudentEmail().startsWith("candidate")) {
                    enrolledMap.putIfAbsent(a.getStudentEmail().trim().toLowerCase(), a);
                }
            }
            enrolled = new ArrayList<>(enrolledMap.values());
            if (studentCount != null && studentCount > 0 && enrolled.size() > studentCount) {
                enrolled = new ArrayList<>(enrolled.subList(0, studentCount));
            }
        } else {
            // For a private (restricted) exam, use students explicitly assigned in the "Assign Students" tab
            List<ExamAssignment> rawEnrolled = assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId);
            Map<String, ExamAssignment> enrolledMap = new LinkedHashMap<>();
            for (ExamAssignment a : rawEnrolled) {
                if (a.getStudentEmail() != null && !a.getStudentEmail().isBlank()) {
                    enrolledMap.putIfAbsent(a.getStudentEmail().trim().toLowerCase(), a);
                }
            }
            enrolled = new ArrayList<>(enrolledMap.values());

            if (studentCount != null && studentCount > 0 && enrolled.size() > studentCount) {
                enrolled = new ArrayList<>(enrolled.subList(0, studentCount));
            }

            if (enrolled.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "No students are assigned to exam ID " + examId + ". Please add student emails in the 'Assign Students' tab first.");
            }
        }

        // Clear previous random assignments for this exam and flush immediately
        entityManager.createNativeQuery("DELETE FROM student_question_assignments WHERE exam_id = :examId")
                .setParameter("examId", examId).executeUpdate();
        entityManager.flush();

        List<StudentQuestionAssignmentEntry> entries = new ArrayList<>();
        Random rng = new Random();

        for (ExamAssignment enrollment : enrolled) {
            String pwd = enrollment.getAccessPassword();
            if (pwd == null || pwd.isBlank()) {
                pwd = generateRandomPassword(8);
                enrollment.setAccessPassword(pwd);
                assignmentRepository.save(enrollment);
            }

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
                            q.getProblemTitle(),
                            q.getMarks() != null ? q.getMarks() : BigDecimal.ONE
                    ))
                    .toList();

            entries.add(new StudentQuestionAssignmentEntry(
                    enrollment.getStudentEmail(), pwd, summaries, sqa.getAssignedAt()));
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

        Map<String, String> passwordsByEmail = new HashMap<>();
        assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId)
                .forEach(a -> {
                    if (a.getStudentEmail() != null) {
                        passwordsByEmail.put(a.getStudentEmail().toLowerCase(), a.getAccessPassword());
                    }
                });

        int qps = sqas.isEmpty()
                ? (exam.getNumQuestions() != null ? exam.getNumQuestions() : 0)
                : sqas.get(0).getQuestionsPerStudent();

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
                                q.getProblemTitle(),
                                q.getMarks() != null ? q.getMarks() : BigDecimal.ONE
                        );
                    })
                    .filter(Objects::nonNull)
                    .toList();

            String pwd = passwordsByEmail.get(sqa.getStudentEmail().toLowerCase());
            entries.add(new StudentQuestionAssignmentEntry(
                    sqa.getStudentEmail(), pwd, summaries, sqa.getAssignedAt()));
        }

        return new QuestionAssignmentReportResponse(
                examId, exam.getName(), bank.size(), qps, entries.size(), entries);
    }

    /**
     * Immediately concludes / terminates an active exam for all candidates.
     */
    @Transactional
    public Exam terminateExamImmediately(Long examId, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        checkClassSettingModificationAllowed(exam, adminEmail);

        Instant now = Instant.now();
        exam.setStatus("CLOSED");
        exam.setEndAt(now);
        examRepository.save(exam);

        List<ExamAttempt> inProgress = examAttemptRepository.findByExamIdAndStatus(examId, "IN_PROGRESS");
        for (ExamAttempt attempt : inProgress) {
            attempt.setStatus("EXPIRED");
            attempt.setEndTime(now);
            examAttemptRepository.save(attempt);
        }

        auditLogService.logAdmin(
                adminEmail != null ? adminEmail : "admin",
                "EXAM_TERMINATED_BY_EXAMINER",
                "Examiner concluded exam ID " + examId + " immediately (" + inProgress.size() + " in-progress attempts expired)."
        );

        return exam;
    }

    /**
     * Live-adjusts the timing of an exam: add minutes, set new endAt, or change duration.
     */
    @Transactional
    public Exam adjustExamTiming(Long examId, Integer addMinutes, Instant newEndAt, Integer newDurationMinutes, String adminEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, adminEmail);
        checkClassSettingModificationAllowed(exam, adminEmail);

        if (addMinutes != null && addMinutes != 0) {
            int newDur = Math.max(1, exam.getDurationMinutes() + addMinutes);
            exam.setDurationMinutes(newDur);
            if (exam.getEndAt() != null) {
                exam.setEndAt(exam.getEndAt().plus(addMinutes, java.time.temporal.ChronoUnit.MINUTES));
            }
        } else if (newEndAt != null) {
            exam.setEndAt(newEndAt);
            if (newDurationMinutes != null && newDurationMinutes > 0) {
                exam.setDurationMinutes(newDurationMinutes);
            }
        } else if (newDurationMinutes != null && newDurationMinutes > 0) {
            exam.setDurationMinutes(newDurationMinutes);
        }

        examRepository.save(exam);

        auditLogService.logAdmin(
                adminEmail != null ? adminEmail : "admin",
                "EXAM_TIMING_ADJUSTED",
                "Examiner adjusted timing for exam ID " + examId + ": duration=" + exam.getDurationMinutes() + " mins, endAt=" + exam.getEndAt()
        );

        return exam;
    }

    public CoordinatorStudentReportResponse getCoordinatorStudentReport(Long examId, String staffEmail) {
        Exam baseExam = getById(examId);
        verifyExamAccess(baseExam, staffEmail);

        // 1. Identify all coordinator-assigned questions in baseExam
        // Coordinator questions have createdByCoordinator == true or createdByRole == "COURSE_COORDINATOR"
        List<ExamQuestion> baseQuestions = questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
        List<ExamQuestion> coordinatorQuestions = baseQuestions.stream()
                .filter(q -> Boolean.TRUE.equals(q.getCreatedByCoordinator()) || "COURSE_COORDINATOR".equalsIgnoreCase(q.getCreatedByRole()))
                .toList();

        // If no questions are explicitly tagged (e.g. legacy exams), all base exam questions not created by a prof are coordinator questions
        if (coordinatorQuestions.isEmpty() && !baseQuestions.isEmpty()) {
            coordinatorQuestions = baseQuestions.stream()
                    .filter(q -> !"PROFESSOR".equalsIgnoreCase(q.getCreatedByRole()))
                    .toList();
            if (coordinatorQuestions.isEmpty()) {
                coordinatorQuestions = baseQuestions;
            }
        }

        final int totalCoordinatorQuestions = coordinatorQuestions.size();

        // 2. Identify all related exams (base exam + cloned section exams for professors)
        List<Exam> relatedExams = new ArrayList<>();
        relatedExams.add(baseExam);

        List<Exam> otherClasses = examRepository.findAll().stream()
                .filter(e -> !e.getId().equals(baseExam.getId()) && Boolean.TRUE.equals(e.getIsClass())
                        && (e.getName().equals(baseExam.getName()) || e.getName().startsWith(baseExam.getName() + " - ")))
                .toList();
        relatedExams.addAll(otherClasses);

        // Map examId -> Set of question IDs that are coordinator questions
        Map<Long, Set<Long>> examCoordinatorQids = new HashMap<>();
        Set<String> coordQuestionSignatures = new HashSet<>();
        for (ExamQuestion cq : coordinatorQuestions) {
            String sig = (cq.getProblemTitle() != null ? cq.getProblemTitle().trim().toLowerCase() : "") + ":::"
                    + (cq.getQuestionText() != null ? cq.getQuestionText().trim().toLowerCase() : "");
            coordQuestionSignatures.add(sig);
        }

        for (Exam ex : relatedExams) {
            List<ExamQuestion> exQuestions = questionRepository.findByExamIdOrderByDisplayOrderAsc(ex.getId());
            Set<Long> qids = new HashSet<>();
            for (ExamQuestion eq : exQuestions) {
                // Must be coordinator question: NOT created by professor of his wish!
                boolean isCoordinator = Boolean.TRUE.equals(eq.getCreatedByCoordinator())
                        || "COURSE_COORDINATOR".equalsIgnoreCase(eq.getCreatedByRole());
                if (!isCoordinator) {
                    String sig = (eq.getProblemTitle() != null ? eq.getProblemTitle().trim().toLowerCase() : "") + ":::"
                            + (eq.getQuestionText() != null ? eq.getQuestionText().trim().toLowerCase() : "");
                    if (coordQuestionSignatures.contains(sig) && !"PROFESSOR".equalsIgnoreCase(eq.getCreatedByRole())) {
                        isCoordinator = true;
                    }
                }
                if (isCoordinator) {
                    qids.add(eq.getId());
                }
            }
            examCoordinatorQids.put(ex.getId(), qids);
        }

        // 3. Collect all students across all related exams
        Map<String, CoordinatorStudentReportItem> reportMap = new LinkedHashMap<>();

        Map<String, Student> studentCache = new HashMap<>();
        for (Student s : studentRepository.findAll()) {
            if (s.getEmail() != null) {
                studentCache.put(s.getEmail().trim().toLowerCase(), s);
            }
        }

        for (Exam ex : relatedExams) {
            String profName = ex.getAssignedProfessorName();
            if (profName == null || profName.isBlank()) {
                profName = baseExam.getAssignedProfessorName();
            }
            if (profName == null || profName.isBlank()) {
                profName = "Course Coordinator";
            }

            // A) Collect from assignments
            List<ExamAssignment> assignments = assignmentRepository.findByExamIdOrderByCreatedAtDesc(ex.getId());
            Set<String> studentEmails = new LinkedHashSet<>();
            for (ExamAssignment a : assignments) {
                if (a.getStudentEmail() != null && !a.getStudentEmail().isBlank()) {
                    studentEmails.add(a.getStudentEmail().trim().toLowerCase());
                }
            }

            // B) Collect from attempts
            List<ExamAttempt> attempts = examAttemptRepository.findByExamId(ex.getId());
            for (ExamAttempt at : attempts) {
                if (at.getStudentEmail() != null && !at.getStudentEmail().isBlank()) {
                    studentEmails.add(at.getStudentEmail().trim().toLowerCase());
                }
            }

            Set<Long> coordQidsForThisExam = examCoordinatorQids.getOrDefault(ex.getId(), Collections.emptySet());

            for (String email : studentEmails) {
                Student s = studentCache.get(email);
                if (s == null) {
                    s = studentRepository.findByEmailIgnoreCase(email).orElse(null);
                    if (s != null) studentCache.put(email, s);
                }

                String regNo = (s != null && s.getRegisterNumber() != null && !s.getRegisterNumber().isBlank())
                        ? s.getRegisterNumber().trim()
                        : (email.contains("@") ? email.substring(0, email.indexOf("@")).toUpperCase() : email.toUpperCase());

                String sName = (s != null && s.getFullName() != null && !s.getFullName().isBlank())
                        ? s.getFullName().trim()
                        : email;

                String dept = (s != null && s.getDepartment() != null && !s.getDepartment().isBlank())
                        ? s.getDepartment().trim()
                        : (ex.getSubject() != null && !ex.getSubject().isBlank() ? ex.getSubject() : "Computer Science");

                // Check attempts for completed coordinator questions
                List<ExamAttempt> studentAttempts = examAttemptRepository
                        .findByExamIdAndStudentEmailIgnoreCaseOrderByAttemptNumberDesc(ex.getId(), email);

                int completed = 0;
                if (!studentAttempts.isEmpty()) {
                    ExamAttempt bestAttempt = studentAttempts.get(0);
                    List<ExamAnswer> answers = answerRepository.findByAttemptId(bestAttempt.getId());
                    for (ExamAnswer ans : answers) {
                        if (ans.getQuestion() != null && coordQidsForThisExam.contains(ans.getQuestion().getId())) {
                            boolean isDone = ans.getSelectedOption() != null
                                    || (ans.getCodeSubmission() != null && !ans.getCodeSubmission().trim().isEmpty());
                            if (isDone) {
                                completed++;
                            }
                        }
                    }
                }

                completed = Math.min(completed, totalCoordinatorQuestions);
                int incomplete = Math.max(0, totalCoordinatorQuestions - completed);

                if (reportMap.containsKey(email)) {
                    CoordinatorStudentReportItem existing = reportMap.get(email);
                    if (completed > existing.completedQuestions()) {
                        reportMap.put(email, new CoordinatorStudentReportItem(
                                s != null ? s.getId() : existing.studentId(),
                                regNo,
                                sName,
                                profName,
                                dept,
                                totalCoordinatorQuestions,
                                completed,
                                incomplete
                        ));
                    }
                } else {
                    reportMap.put(email, new CoordinatorStudentReportItem(
                            s != null ? s.getId() : null,
                            regNo,
                            sName,
                            profName,
                            dept,
                            totalCoordinatorQuestions,
                            completed,
                            incomplete
                    ));
                }
            }
        }

        // If class has no assigned students yet, include all enrolled students in the database as demo/incomplete rows
        if (reportMap.isEmpty()) {
            List<Student> allStudents = studentRepository.findAll();
            for (Student s : allStudents) {
                String regNo = s.getRegisterNumber() != null && !s.getRegisterNumber().isBlank()
                        ? s.getRegisterNumber()
                        : "REG-" + s.getId();
                String sName = s.getFullName() != null && !s.getFullName().isBlank() ? s.getFullName() : s.getEmail();
                String dept = s.getDepartment() != null && !s.getDepartment().isBlank() ? s.getDepartment() : "Computer Science";
                String profName = baseExam.getAssignedProfessorName() != null ? baseExam.getAssignedProfessorName() : "Course Coordinator";

                reportMap.put(s.getEmail().toLowerCase(), new CoordinatorStudentReportItem(
                        s.getId(),
                        regNo,
                        sName,
                        profName,
                        dept,
                        totalCoordinatorQuestions,
                        0,
                        totalCoordinatorQuestions
                ));
            }
        }

        List<CoordinatorStudentReportItem> items = new ArrayList<>(reportMap.values());
        return new CoordinatorStudentReportResponse(baseExam.getId(), baseExam.getName(), totalCoordinatorQuestions, items);
    }

    public ProfessorStudentReportResponse getProfessorStudentReport(Long examId, String staffEmail) {
        Exam exam = getById(examId);
        verifyExamAccess(exam, staffEmail);

        // All questions in this exam: coordinator-assigned questions + questions given by the prof himself
        List<ExamQuestion> examQuestions = questionRepository.findByExamIdOrderByDisplayOrderAsc(examId);
        int totalQuestions = examQuestions.size();

        int coordCount = (int) examQuestions.stream()
                .filter(q -> Boolean.TRUE.equals(q.getCreatedByCoordinator()) || "COURSE_COORDINATOR".equalsIgnoreCase(q.getCreatedByRole()))
                .count();
        int profCount = Math.max(0, totalQuestions - coordCount);

        Set<Long> allQuestionIds = examQuestions.stream()
                .map(ExamQuestion::getId)
                .collect(Collectors.toSet());

        // Students assigned to this professor's exam/section
        Map<String, ProfessorStudentReportItem> reportMap = new LinkedHashMap<>();

        Map<String, Student> studentCache = new HashMap<>();
        for (Student s : studentRepository.findAll()) {
            if (s.getEmail() != null) {
                studentCache.put(s.getEmail().trim().toLowerCase(), s);
            }
        }

        // 1. From ExamAssignment on this exam
        List<ExamAssignment> assignments = assignmentRepository.findByExamIdOrderByCreatedAtDesc(examId);
        Set<String> assignedEmails = new LinkedHashSet<>();
        for (ExamAssignment a : assignments) {
            if (a.getStudentEmail() != null && !a.getStudentEmail().isBlank()) {
                assignedEmails.add(a.getStudentEmail().trim().toLowerCase());
            }
        }

        // 2. From ExamAttempt on this exam
        List<ExamAttempt> attempts = examAttemptRepository.findByExamId(examId);
        for (ExamAttempt at : attempts) {
            if (at.getStudentEmail() != null && !at.getStudentEmail().isBlank()) {
                assignedEmails.add(at.getStudentEmail().trim().toLowerCase());
            }
        }

        for (String email : assignedEmails) {
            Student s = studentCache.get(email);
            if (s == null) {
                s = studentRepository.findByEmailIgnoreCase(email).orElse(null);
                if (s != null) studentCache.put(email, s);
            }

            String regNo = (s != null && s.getRegisterNumber() != null && !s.getRegisterNumber().isBlank())
                    ? s.getRegisterNumber().trim()
                    : (email.contains("@") ? email.substring(0, email.indexOf("@")).toUpperCase() : email.toUpperCase());

            String sName = (s != null && s.getFullName() != null && !s.getFullName().isBlank())
                    ? s.getFullName().trim()
                    : email;

            List<ExamAttempt> studentAttempts = examAttemptRepository
                    .findByExamIdAndStudentEmailIgnoreCaseOrderByAttemptNumberDesc(examId, email);

            int completed = 0;
            if (!studentAttempts.isEmpty()) {
                ExamAttempt bestAttempt = studentAttempts.get(0);
                List<ExamAnswer> answers = answerRepository.findByAttemptId(bestAttempt.getId());
                for (ExamAnswer ans : answers) {
                    if (ans.getQuestion() != null && allQuestionIds.contains(ans.getQuestion().getId())) {
                        boolean isDone = ans.getSelectedOption() != null
                                || (ans.getCodeSubmission() != null && !ans.getCodeSubmission().trim().isEmpty());
                        if (isDone) {
                            completed++;
                        }
                    }
                }
            }

            completed = Math.min(completed, totalQuestions);
            int incomplete = Math.max(0, totalQuestions - completed);

            reportMap.put(email, new ProfessorStudentReportItem(
                    s != null ? s.getId() : null,
                    regNo,
                    sName,
                    totalQuestions,
                    completed,
                    incomplete
            ));
        }

        // If no students explicitly assigned yet, show registered students in the system as demo rows
        if (reportMap.isEmpty()) {
            List<Student> allStudents = studentRepository.findAll();
            for (Student s : allStudents) {
                String regNo = s.getRegisterNumber() != null && !s.getRegisterNumber().isBlank()
                        ? s.getRegisterNumber()
                        : "REG-" + s.getId();
                String sName = s.getFullName() != null && !s.getFullName().isBlank() ? s.getFullName() : s.getEmail();

                reportMap.put(s.getEmail().toLowerCase(), new ProfessorStudentReportItem(
                        s.getId(),
                        regNo,
                        sName,
                        totalQuestions,
                        0,
                        totalQuestions
                ));
            }
        }

        List<ProfessorStudentReportItem> items = new ArrayList<>(reportMap.values());
        return new ProfessorStudentReportResponse(exam.getId(), exam.getName(), totalQuestions, coordCount, profCount, items);
    }

    private static String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "…";
    }
}
