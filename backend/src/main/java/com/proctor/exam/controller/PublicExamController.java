package com.proctor.exam.controller;

import com.proctor.exam.dto.ExamSummaryResponse;
import com.proctor.exam.dto.VerifyStudentRequest;
import com.proctor.exam.dto.VerifyStudentResponse;
import com.proctor.exam.entity.Admin;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.entity.Professor;
import com.proctor.exam.repository.AdminRepository;
import com.proctor.exam.repository.ExamRepository;
import com.proctor.exam.repository.ProfessorRepository;
import com.proctor.exam.service.StudentExamService;
import com.proctor.exam.service.TrustedTimeService;
import jakarta.validation.Valid;
import com.proctor.exam.repository.ExamAssignmentRepository;
import com.proctor.exam.repository.StudentRepository;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/** Unauthenticated endpoints: the public exams list (landing page), network time, and email verification. */
@RestController
@RequestMapping("/api/exams")
public class PublicExamController {

    private final ExamRepository examRepository;
    private final StudentExamService studentExamService;
    private final TrustedTimeService trustedTimeService;
    private final com.proctor.exam.service.CodeExecutionService codeExecutionService;
    private final ExamAssignmentRepository assignmentRepository;
    private final StudentRepository studentRepository;
    private final AdminRepository adminRepository;
    private final ProfessorRepository professorRepository;
    private final com.proctor.exam.repository.ExamAttemptRepository attemptRepository;

    public PublicExamController(ExamRepository examRepository,
                                StudentExamService studentExamService,
                                TrustedTimeService trustedTimeService,
                                com.proctor.exam.service.CodeExecutionService codeExecutionService,
                                ExamAssignmentRepository assignmentRepository,
                                StudentRepository studentRepository,
                                AdminRepository adminRepository,
                                ProfessorRepository professorRepository,
                                com.proctor.exam.repository.ExamAttemptRepository attemptRepository) {
        this.examRepository = examRepository;
        this.studentExamService = studentExamService;
        this.trustedTimeService = trustedTimeService;
        this.codeExecutionService = codeExecutionService;
        this.assignmentRepository = assignmentRepository;
        this.studentRepository = studentRepository;
        this.adminRepository = adminRepository;
        this.professorRepository = professorRepository;
        this.attemptRepository = attemptRepository;
    }

    private boolean isProfessorOrFaculty(Authentication auth, String email) {
        if (auth != null) {
            boolean hasProfRole = auth.getAuthorities().stream().anyMatch(a -> {
                String role = a.getAuthority().toUpperCase();
                return role.equals("ROLE_PROFESSOR") || role.equals("ROLE_FACULTY") || role.equals("ROLE_EXAMINER");
            });
            if (hasProfRole) return true;
        }
        if (email != null && !email.isBlank()) {
            if (professorRepository.findByEmailIgnoreCase(email.trim()).isPresent()) return true;
            Admin admin = adminRepository.findByEmail(email.trim().toLowerCase()).orElse(null);
            if (admin != null) {
                String r = admin.getRole();
                return "PROFESSOR".equalsIgnoreCase(r) || "FACULTY".equalsIgnoreCase(r) || "EXAMINER".equalsIgnoreCase(r);
            }
        }
        return false;
    }

    private boolean isExamAssignedOrCreatedByProf(Exam e, String email) {
        if (email == null || email.isBlank()) return false;
        String emailLower = email.trim().toLowerCase();
        Admin admin = adminRepository.findByEmail(emailLower).orElse(null);
        Professor prof = professorRepository.findByEmailIgnoreCase(emailLower).orElse(null);
        Long adminId = admin != null ? admin.getId() : null;
        Long profId = prof != null ? prof.getId() : null;

        boolean isCreator = adminId != null && e.getCreatedBy() != null && e.getCreatedBy().equals(adminId);
        boolean isAssignedByEmail = e.getAssignedProfessorEmail() != null && e.getAssignedProfessorEmail().equalsIgnoreCase(emailLower);
        boolean isAssignedById = e.getAssignedProfessorId() != null &&
                ((adminId != null && e.getAssignedProfessorId().equals(adminId)) || (profId != null && e.getAssignedProfessorId().equals(profId)));

        return isCreator || isAssignedByEmail || isAssignedById;
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
    public List<ExamSummaryResponse> listPublicExams(Authentication auth) {
        Instant now = trustedTimeService.now();
        List<Exam> publishedExams = examRepository.findByStatus("PUBLISHED");

        boolean isAuthenticated = auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getName());
        boolean isStudent = isAuthenticated && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_STUDENT".equalsIgnoreCase(a.getAuthority()));

        Map<Long, String> attemptStatusByExamId = new HashMap<>();

        if (isStudent) {
            String callerIdentifier = auth.getName().trim().toLowerCase();
            Set<String> searchIdentifiers = new HashSet<>();
            searchIdentifiers.add(callerIdentifier);

            studentRepository.findByEmailIgnoreCase(callerIdentifier).ifPresent(s -> {
                if (s.getEmail() != null) searchIdentifiers.add(s.getEmail().trim().toLowerCase());
                if (s.getRegisterNumber() != null) searchIdentifiers.add(s.getRegisterNumber().trim().toLowerCase());
            });

            studentRepository.findByRegisterNumberIgnoreCase(callerIdentifier).ifPresent(s -> {
                if (s.getEmail() != null) searchIdentifiers.add(s.getEmail().trim().toLowerCase());
                if (s.getRegisterNumber() != null) searchIdentifiers.add(s.getRegisterNumber().trim().toLowerCase());
            });

            Set<Long> assignedExamIds = assignmentRepository.findAssignedExamIdsByStudentIdentifiers(searchIdentifiers);

            // Students see the exams and classes they are assigned to, as well as open-to-all exams
            publishedExams = publishedExams.stream()
                    .filter(e -> assignedExamIds.contains(e.getId()) || e.isOpenToAll())
                    .toList();

            try {
                List<com.proctor.exam.entity.ExamAttempt> attempts = attemptRepository.findByStudentEmailIgnoreCaseIn(searchIdentifiers);
                for (com.proctor.exam.entity.ExamAttempt a : attempts) {
                    if (a.getExam() != null && a.getExam().getId() != null) {
                        Long eid = a.getExam().getId();
                        String prev = attemptStatusByExamId.get(eid);
                        if ("SUBMITTED".equalsIgnoreCase(a.getStatus()) || "COMPLETED".equalsIgnoreCase(a.getStatus())) {
                            attemptStatusByExamId.put(eid, "COMPLETED");
                        } else if (!"COMPLETED".equals(prev)) {
                            if ("IN_PROGRESS".equalsIgnoreCase(a.getStatus())) {
                                attemptStatusByExamId.put(eid, "IN_PROGRESS");
                            } else if ("INCOMPLETE".equalsIgnoreCase(a.getStatus()) || "TERMINATED".equalsIgnoreCase(a.getStatus())) {
                                attemptStatusByExamId.put(eid, "INCOMPLETE");
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        } else if (isAuthenticated && isProfessorOrFaculty(auth, auth.getName())) {
            // Professor should ONLY see the class or exam assigned to him and the exam he created;
            // other than that he should not see any exam or class
            String profEmail = auth.getName();
            publishedExams = publishedExams.stream()
                    .filter(e -> isExamAssignedOrCreatedByProf(e, profEmail))
                    .toList();
        } else if (!isAuthenticated) {
            // Unauthenticated guest: only open-to-all exams
            publishedExams = publishedExams.stream()
                    .filter(Exam::isOpenToAll)
                    .toList();
        }

        return publishedExams.stream()
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
                        Boolean.TRUE.equals(e.getIsClass()),
                        e.isOpenToAll(),
                        attemptStatusByExamId.get(e.getId())
                ))
                .toList();
    }

    private String computeDisplayStatus(Exam e, Instant now) {
        if (now.isBefore(e.getStartAt())) return "UPCOMING";
        if (now.isAfter(e.getEndAt())) return "CLOSED";
        return "OPEN";
    }

    @GetMapping("/{examId}")
    public Map<String, Object> getPublicExamDetails(@PathVariable Long examId, Authentication auth) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new com.proctor.exam.exception.ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Exam not found."));

        boolean isAuthenticated = auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getName());
        boolean isStudent = isAuthenticated && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_STUDENT".equalsIgnoreCase(a.getAuthority()));

        if (isStudent && !exam.isOpenToAll()) {
            String callerIdentifier = auth.getName().trim().toLowerCase();
            boolean isAssigned = assignmentRepository.existsByExamIdAndStudentEmailIgnoreCase(examId, callerIdentifier);
            if (!isAssigned) {
                Optional<com.proctor.exam.entity.Student> sOpt = studentRepository.findByEmailIgnoreCase(callerIdentifier);
                if (sOpt.isPresent() && sOpt.get().getRegisterNumber() != null) {
                    isAssigned = assignmentRepository.existsByExamIdAndStudentEmailIgnoreCase(examId, sOpt.get().getRegisterNumber().trim().toLowerCase());
                }
            }
            if (!isAssigned) {
                throw new com.proctor.exam.exception.ApiException(
                        org.springframework.http.HttpStatus.FORBIDDEN,
                        "You are not assigned to this " + (Boolean.TRUE.equals(exam.getIsClass()) ? "class" : "examination") + "."
                );
            }
        } else if (isAuthenticated && isProfessorOrFaculty(auth, auth.getName())) {
            if (!isExamAssignedOrCreatedByProf(exam, auth.getName())) {
                throw new com.proctor.exam.exception.ApiException(
                        org.springframework.http.HttpStatus.FORBIDDEN,
                        "Access denied: As a Professor / Faculty, you can only view and access examinations or classes assigned to or created by you."
                );
            }
        }

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
