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

    public List<AdminUserResponse> listUsers() {
        return adminRepository.findAll().stream()
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .map(this::toResponse)
                .toList();
    }

    public AdminUserResponse getUserById(Long id) {
        Admin admin = adminRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with id: " + id));
        return toResponse(admin);
    }

    @Transactional
    public AdminUserResponse createUser(CreateAdminUserRequest request, String callerEmail) {
        String email = request.email().trim().toLowerCase();
        if (adminRepository.findByEmail(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "A user with email '" + email + "' already exists.");
        }

        String rawPassword = request.password().trim();
        if (rawPassword.length() < 6) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters long.");
        }

        String role = (request.role() != null && !request.role().isBlank())
                ? request.role().trim().toUpperCase()
                : "ADMIN";

        Admin admin = Admin.builder()
                .email(email)
                .fullName(request.fullName().trim())
                .passwordHash(passwordEncoder.encode(rawPassword))
                .displayPassword(rawPassword)
                .role(role)
                .failedAttempts(0)
                .lockedUntil(null)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        Admin saved = adminRepository.save(admin);
        auditLogService.logAdmin(callerEmail, "ADMIN_USER_CREATED",
                "Created user account " + email + " with role " + role);

        return toResponse(saved);
    }

    @Transactional
    public AdminUserResponse updateUser(Long id, UpdateAdminUserRequest request, String callerEmail) {
        Admin admin = adminRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with id: " + id));

        if (request.email() != null && !request.email().isBlank()) {
            String newEmail = request.email().trim().toLowerCase();
            if (!newEmail.equalsIgnoreCase(admin.getEmail())) {
                if (adminRepository.findByEmail(newEmail).isPresent()) {
                    throw new ApiException(HttpStatus.CONFLICT, "A user with email '" + newEmail + "' already exists.");
                }
                admin.setEmail(newEmail);
            }
        }

        if (request.fullName() != null && !request.fullName().isBlank()) {
            admin.setFullName(request.fullName().trim());
        }

        if (request.role() != null && !request.role().isBlank()) {
            admin.setRole(request.role().trim().toUpperCase());
        }

        if (request.password() != null && !request.password().trim().isEmpty()) {
            String newRawPassword = request.password().trim();
            if (newRawPassword.length() < 6) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "New password must be at least 6 characters long.");
            }
            admin.setPasswordHash(passwordEncoder.encode(newRawPassword));
            admin.setDisplayPassword(newRawPassword);
        }

        if (Boolean.TRUE.equals(request.resetLock())) {
            admin.setFailedAttempts(0);
            admin.setLockedUntil(null);
        }

        admin.setUpdatedAt(Instant.now());
        Admin saved = adminRepository.save(admin);

        auditLogService.logAdmin(callerEmail, "ADMIN_USER_UPDATED",
                "Updated credentials/profile for user " + saved.getEmail());

        return toResponse(saved);
    }

    @Transactional
    public void deleteUser(Long id, String callerEmail) {
        Admin admin = adminRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with id: " + id));

        if (admin.getEmail().equalsIgnoreCase(callerEmail)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot delete your own active administrator account.");
        }

        // Unlink created exams if any exist to maintain database referential integrity
        List<Exam> exams = examRepository.findAll().stream()
                .filter(e -> id.equals(e.getCreatedBy()))
                .toList();
        for (Exam e : exams) {
            e.setCreatedBy(null);
            examRepository.save(e);
        }

        adminRepository.delete(admin);
        auditLogService.logAdmin(callerEmail, "ADMIN_USER_DELETED",
                "Deleted user account " + admin.getEmail());
    }

    private AdminUserResponse toResponse(Admin admin) {
        boolean isLocked = admin.getLockedUntil() != null && admin.getLockedUntil().isAfter(Instant.now());
        return new AdminUserResponse(
                admin.getId(),
                admin.getEmail(),
                admin.getFullName(),
                admin.getRole(),
                admin.getDisplayPassword(),
                admin.getFailedAttempts(),
                isLocked,
                admin.getLockedUntil(),
                admin.getCreatedAt(),
                admin.getUpdatedAt()
        );
    }
}
