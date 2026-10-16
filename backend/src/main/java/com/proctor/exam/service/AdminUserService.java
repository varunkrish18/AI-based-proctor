package com.proctor.exam.service;

import com.proctor.exam.dto.AdminUserResponse;
import com.proctor.exam.dto.CreateAdminUserRequest;
import com.proctor.exam.dto.UpdateAdminUserRequest;
import com.proctor.exam.entity.Admin;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.AdminRepository;
import com.proctor.exam.repository.ExamRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class AdminUserService {

    private final AdminRepository adminRepository;
    private final ExamRepository examRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;

    public AdminUserService(AdminRepository adminRepository,
                            ExamRepository examRepository,
                            PasswordEncoder passwordEncoder,
                            AuditLogService auditLogService) {
        this.adminRepository = adminRepository;
        this.examRepository = examRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogService = auditLogService;
    }

    private boolean isFacultyRole(String role) {
        if (role == null) return false;
        String r = role.trim().toUpperCase();
        return "FACULTY".equals(r) || "EXAMINER".equals(r);
    }

    public List<AdminUserResponse> listUsers(String callerEmail) {
        Admin caller = (callerEmail != null && !callerEmail.isBlank())
                ? adminRepository.findByEmail(callerEmail.toLowerCase()).orElse(null)
                : null;

        // If caller is a COURSE_COORDINATOR, restrict view strictly to faculty in their department
        if (caller != null && "COURSE_COORDINATOR".equalsIgnoreCase(caller.getRole())) {
            String dept = caller.getDepartment();
            if (dept == null || dept.isBlank()) {
                return List.of();
            }
            return adminRepository.findAll().stream()
                    .filter(u -> isFacultyRole(u.getRole()))
                    .filter(u -> dept.equalsIgnoreCase(u.getDepartment()))
                    .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                    .map(this::toResponse)
                    .toList();
        }

        // Global admin sees all users
        return adminRepository.findAll().stream()
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .map(this::toResponse)
                .toList();
    }

    public AdminUserResponse getUserById(Long id, String callerEmail) {
        Admin caller = (callerEmail != null && !callerEmail.isBlank())
                ? adminRepository.findByEmail(callerEmail.toLowerCase()).orElse(null)
                : null;

        Admin target = adminRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with id: " + id));

        if (caller != null && "COURSE_COORDINATOR".equalsIgnoreCase(caller.getRole())) {
            String dept = caller.getDepartment();
            if (!isFacultyRole(target.getRole()) || dept == null || !dept.equalsIgnoreCase(target.getDepartment())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You only have access to view faculty in your department.");
            }
        }

        return toResponse(target);
    }

    @Transactional
    public AdminUserResponse createUser(CreateAdminUserRequest request, String callerEmail) {
        Admin caller = adminRepository.findByEmail(callerEmail.toLowerCase())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Caller not found."));

        boolean isCoordinator = "COURSE_COORDINATOR".equalsIgnoreCase(caller.getRole());

        String email = request.email().trim().toLowerCase();
        if (adminRepository.findByEmail(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "A user with email '" + email + "' already exists.");
        }

        String rawPassword = request.password().trim();
        if (rawPassword.length() < 6) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters long.");
        }

        String role;
        String department;

        if (isCoordinator) {
            // Coordinator can only create faculty in their own department
            role = "FACULTY";
            department = caller.getDepartment();
            if (department == null || department.isBlank()) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Course coordinator does not have an assigned department.");
            }
        } else {
            // Admin can create any role and department
            role = (request.role() != null && !request.role().isBlank())
                    ? request.role().trim().toUpperCase()
                    : "ADMIN";
            department = (request.department() != null && !request.department().isBlank())
                    ? request.department().trim()
                    : null;
        }

        Admin admin = Admin.builder()
                .email(email)
                .fullName(request.fullName().trim())
                .passwordHash(passwordEncoder.encode(rawPassword))
                .displayPassword(rawPassword)
                .role(role)
                .department(department)
                .failedAttempts(0)
                .lockedUntil(null)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        Admin saved = adminRepository.save(admin);
        auditLogService.logAdmin(callerEmail, "ADMIN_USER_CREATED",
                "Created user account " + email + " with role " + role + (department != null ? " in dept " + department : ""));

        return toResponse(saved);
    }

    @Transactional
    public AdminUserResponse updateUser(Long id, UpdateAdminUserRequest request, String callerEmail) {
        Admin caller = adminRepository.findByEmail(callerEmail.toLowerCase())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Caller not found."));

        Admin target = adminRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with id: " + id));

        boolean isCoordinator = "COURSE_COORDINATOR".equalsIgnoreCase(caller.getRole());
        if (isCoordinator) {
            String dept = caller.getDepartment();
            if (!isFacultyRole(target.getRole()) || dept == null || !dept.equalsIgnoreCase(target.getDepartment())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You only have access to manage faculty in your department.");
            }
        }

        if (request.email() != null && !request.email().isBlank()) {
            String newEmail = request.email().trim().toLowerCase();
            if (!newEmail.equalsIgnoreCase(target.getEmail())) {
                if (adminRepository.findByEmail(newEmail).isPresent()) {
                    throw new ApiException(HttpStatus.CONFLICT, "A user with email '" + newEmail + "' already exists.");
                }
                target.setEmail(newEmail);
            }
        }

        if (request.fullName() != null && !request.fullName().isBlank()) {
            target.setFullName(request.fullName().trim());
        }

        if (!isCoordinator) {
            if (request.role() != null && !request.role().isBlank()) {
                target.setRole(request.role().trim().toUpperCase());
            }
            if (request.department() != null) {
                target.setDepartment(request.department().trim().isEmpty() ? null : request.department().trim());
            }
        }

        if (request.password() != null && !request.password().trim().isEmpty()) {
            String newRawPassword = request.password().trim();
            if (newRawPassword.length() < 6) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "New password must be at least 6 characters long.");
            }
            target.setPasswordHash(passwordEncoder.encode(newRawPassword));
            target.setDisplayPassword(newRawPassword);
        }

        if (Boolean.TRUE.equals(request.resetLock())) {
            target.setFailedAttempts(0);
            target.setLockedUntil(null);
        }

        target.setUpdatedAt(Instant.now());
        Admin saved = adminRepository.save(target);

        auditLogService.logAdmin(callerEmail, "ADMIN_USER_UPDATED",
                "Updated credentials/profile for user " + saved.getEmail());

        return toResponse(saved);
    }

    @Transactional
    public void deleteUser(Long id, String callerEmail) {
        Admin caller = adminRepository.findByEmail(callerEmail.toLowerCase())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Caller not found."));

        Admin target = adminRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with id: " + id));

        if (target.getEmail().equalsIgnoreCase(callerEmail)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot delete your own active administrator account.");
        }

        boolean isCoordinator = "COURSE_COORDINATOR".equalsIgnoreCase(caller.getRole());
        if (isCoordinator) {
            String dept = caller.getDepartment();
            if (!isFacultyRole(target.getRole()) || dept == null || !dept.equalsIgnoreCase(target.getDepartment())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You only have access to delete faculty in your department.");
            }
        }

        // Unlink created exams if any exist to maintain database referential integrity
        List<Exam> exams = examRepository.findAll().stream()
                .filter(e -> id.equals(e.getCreatedBy()))
                .toList();
        for (Exam e : exams) {
            e.setCreatedBy(null);
            examRepository.save(e);
        }

        adminRepository.delete(target);
        auditLogService.logAdmin(callerEmail, "ADMIN_USER_DELETED",
                "Deleted user account " + target.getEmail());
    }

    public AdminUserResponse getMe(String callerEmail) {
        Admin admin = adminRepository.findByEmail(callerEmail.toLowerCase())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with email: " + callerEmail));
        return toResponse(admin);
    }

    private AdminUserResponse toResponse(Admin admin) {
        boolean isLocked = admin.getLockedUntil() != null && admin.getLockedUntil().isAfter(Instant.now());
        return new AdminUserResponse(
                admin.getId(),
                admin.getEmail(),
                admin.getFullName(),
                admin.getRole(),
                admin.getDepartment(),
                admin.getDisplayPassword(),
                admin.getFailedAttempts(),
                isLocked,
                admin.getLockedUntil(),
                admin.getCreatedAt(),
                admin.getUpdatedAt()
        );
    }
}
