package com.proctor.exam.service;

import com.proctor.exam.dto.ResetPasswordRequest;
import com.proctor.exam.dto.UnifiedAuthResponse;
import com.proctor.exam.dto.UnifiedLoginRequest;
import com.proctor.exam.entity.Admin;
import com.proctor.exam.entity.Professor;
import com.proctor.exam.entity.RefreshToken;
import com.proctor.exam.entity.Student;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.AdminRepository;
import com.proctor.exam.repository.ProfessorRepository;
import com.proctor.exam.repository.RefreshTokenRepository;
import com.proctor.exam.repository.StudentRepository;
import com.proctor.exam.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

@Service
public class UnifiedAuthService {

    private final AdminRepository adminRepository;
    private final ProfessorRepository professorRepository;
    private final StudentRepository studentRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditLogService auditLogService;

    @Value("${app.security.admin-lockout-attempts:5}")
    private int lockoutAttempts;

    @Value("${app.security.admin-lockout-minutes:15}")
    private int lockoutMinutes;

    @Value("${app.jwt.admin-access-token-minutes:30}")
    private long adminAccessMinutes;

    @Value("${app.jwt.student-session-token-minutes:240}")
    private long studentSessionMinutes;

    public UnifiedAuthService(AdminRepository adminRepository,
                              ProfessorRepository professorRepository,
                              StudentRepository studentRepository,
                              RefreshTokenRepository refreshTokenRepository,
                              PasswordEncoder passwordEncoder,
                              JwtService jwtService,
                              AuditLogService auditLogService) {
        this.adminRepository = adminRepository;
        this.professorRepository = professorRepository;
        this.studentRepository = studentRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.auditLogService = auditLogService;
    }

    @Transactional
    public UnifiedAuthResponse login(UnifiedLoginRequest request) {
        String idRaw = request.identifier().trim();
        String pwd = request.password().trim();

        // 1. Check Admin / Coordinator / Synced Staff
        Admin admin = adminRepository.findByEmail(idRaw.toLowerCase()).orElse(null);
        if (admin != null) {
            if (admin.getLockedUntil() != null && admin.getLockedUntil().isAfter(Instant.now())) {
                auditLogService.logAdmin(admin.getEmail(), "ADMIN_LOGIN_LOCKED", "Account locked");
                throw new ApiException(HttpStatus.LOCKED, "Account locked due to repeated failed attempts. Try again later.");
            }

            boolean pwdMatches = (admin.getPasswordHash() != null && passwordEncoder.matches(pwd, admin.getPasswordHash()))
                    || (admin.getDisplayPassword() != null && admin.getDisplayPassword().equals(pwd));

            if (!pwdMatches) {
                registerAdminFailedAttempt(admin);
                auditLogService.logAdmin(admin.getEmail(), "LOGIN_FAILED", "Password mismatch");
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid identifier or password.");
            }

            admin.setFailedAttempts(0);
            admin.setLockedUntil(null);
            adminRepository.save(admin);

            boolean mustReset = Boolean.TRUE.equals(admin.getMustResetPassword());
            String role = admin.getRole() != null ? admin.getRole().toUpperCase() : "ADMIN";
            String accessToken = jwtService.generateUserToken(admin.getEmail(), role, admin.getDepartment(), admin.getFullName(), null, mustReset);
            String rawRefreshToken = issueRefreshToken(admin);

            auditLogService.logAdmin(admin.getEmail(), "LOGIN_SUCCESS", "Logged in with role " + role);
            return new UnifiedAuthResponse(accessToken, rawRefreshToken, role, admin.getEmail(), admin.getFullName(), admin.getDepartment(), null, mustReset, adminAccessMinutes * 60);
        }

        // 2. Check Professor by email OR staff code
        Professor professor = professorRepository.findByEmailIgnoreCase(idRaw).orElse(null);
        if (professor == null) {
            professor = professorRepository.findByStaffCodeIgnoreCase(idRaw).orElse(null);
        }

        if (professor != null) {
            boolean pwdMatches = (professor.getPasswordHash() != null && passwordEncoder.matches(pwd, professor.getPasswordHash()))
                    || (professor.getDisplayPassword() != null && professor.getDisplayPassword().equals(pwd));

            if (!pwdMatches) {
                auditLogService.logAdmin(professor.getEmail(), "LOGIN_FAILED", "Professor password mismatch");
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid identifier or password.");
            }

            // Sync with admin table if not already mirrored
            Admin syncedAdmin = adminRepository.findByEmail(professor.getEmail().toLowerCase()).orElse(null);
            if (syncedAdmin == null) {
                syncedAdmin = adminRepository.save(Admin.builder()
                        .email(professor.getEmail().toLowerCase())
                        .fullName(professor.getFullName())
                        .department(professor.getDepartment())
                        .role("PROFESSOR")
                        .displayPassword(professor.getDisplayPassword())
                        .passwordHash(professor.getPasswordHash())
                        .mustResetPassword(Boolean.TRUE.equals(professor.getMustResetPassword()))
                        .build());
            }

            boolean mustReset = Boolean.TRUE.equals(professor.getMustResetPassword());
            String accessToken = jwtService.generateUserToken(professor.getEmail(), "PROFESSOR", professor.getDepartment(), professor.getFullName(), professor.getStaffCode(), mustReset);
            String rawRefreshToken = issueRefreshToken(syncedAdmin);

            auditLogService.logAdmin(professor.getEmail(), "LOGIN_SUCCESS", "Professor logged in: " + professor.getStaffCode());
            return new UnifiedAuthResponse(accessToken, rawRefreshToken, "PROFESSOR", professor.getEmail(), professor.getFullName(), professor.getDepartment(), professor.getStaffCode(), mustReset, adminAccessMinutes * 60);
        }

        // 3. Check Student by email OR register number
        Student student = studentRepository.findByEmailIgnoreCase(idRaw).orElse(null);
        if (student == null) {
            student = studentRepository.findByRegisterNumberIgnoreCase(idRaw).orElse(null);
        }

        if (student != null) {
            boolean pwdMatches = (student.getPasswordHash() != null && passwordEncoder.matches(pwd, student.getPasswordHash()))
                    || (student.getDisplayPassword() != null && student.getDisplayPassword().equals(pwd));

            if (!pwdMatches) {
                auditLogService.logAdmin(student.getEmail(), "LOGIN_FAILED", "Student password mismatch");
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid identifier or password.");
            }

            boolean mustReset = Boolean.TRUE.equals(student.getMustResetPassword());
            String accessToken = jwtService.generateUserToken(student.getEmail(), "STUDENT", student.getDepartment(), student.getFullName(), student.getRegisterNumber(), mustReset);

            auditLogService.logAdmin(student.getEmail(), "LOGIN_SUCCESS", "Student logged in: " + student.getRegisterNumber());
            return new UnifiedAuthResponse(accessToken, null, "STUDENT", student.getEmail(), student.getFullName(), student.getDepartment(), student.getRegisterNumber(), mustReset, studentSessionMinutes * 60);
        }

        throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email, staff code, or register number, or incorrect password.");
    }

    @Transactional
    public Map<String, Object> resetPassword(ResetPasswordRequest request, String callerEmail) {
        if (callerEmail == null || callerEmail.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "User session not authenticated.");
        }

        String newPassword = request.newPassword().trim();
        if (newPassword.length() < 6) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters long.");
        }

        String encoded = passwordEncoder.encode(newPassword);
        boolean found = false;

        // Update in Admins
        Admin admin = adminRepository.findByEmail(callerEmail.toLowerCase()).orElse(null);
        if (admin != null) {
            admin.setPasswordHash(encoded);
            admin.setDisplayPassword(newPassword);
            admin.setMustResetPassword(false);
            admin.setUpdatedAt(Instant.now());
            adminRepository.save(admin);
            found = true;
        }

        // Update in Professors
        Professor professor = professorRepository.findByEmailIgnoreCase(callerEmail).orElse(null);
        if (professor != null) {
            professor.setPasswordHash(encoded);
            professor.setDisplayPassword(newPassword);
            professor.setMustResetPassword(false);
            professor.setUpdatedAt(Instant.now());
            professorRepository.save(professor);
            found = true;
        }

        // Update in Students
        Student student = studentRepository.findByEmailIgnoreCase(callerEmail).orElse(null);
        if (student != null) {
            student.setPasswordHash(encoded);
            student.setDisplayPassword(newPassword);
            student.setMustResetPassword(false);
            studentRepository.save(student);
            found = true;
        }

        if (!found) {
            throw new ApiException(HttpStatus.NOT_FOUND, "User account not found for password reset.");
        }

        auditLogService.logAdmin(callerEmail, "PASSWORD_RESET_SUCCESS", "User completed first-time password reset");
        return Map.of("success", true, "message", "Password has been successfully updated. Welcome to your examination portal!");
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getCurrentUser(String callerEmail) {
        if (callerEmail == null || callerEmail.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }

        Admin admin = adminRepository.findByEmail(callerEmail.toLowerCase()).orElse(null);
        if (admin != null) {
            return Map.of(
                    "email", admin.getEmail(),
                    "fullName", admin.getFullName(),
                    "role", admin.getRole(),
                    "department", admin.getDepartment() != null ? admin.getDepartment() : "",
                    "identifier", "",
                    "mustResetPassword", Boolean.TRUE.equals(admin.getMustResetPassword())
            );
        }

        Professor prof = professorRepository.findByEmailIgnoreCase(callerEmail).orElse(null);
        if (prof != null) {
            return Map.of(
                    "email", prof.getEmail(),
                    "fullName", prof.getFullName(),
                    "role", "PROFESSOR",
                    "department", prof.getDepartment() != null ? prof.getDepartment() : "",
                    "identifier", prof.getStaffCode() != null ? prof.getStaffCode() : "",
                    "mustResetPassword", Boolean.TRUE.equals(prof.getMustResetPassword())
            );
        }

        Student student = studentRepository.findByEmailIgnoreCase(callerEmail).orElse(null);
        if (student != null) {
            return Map.of(
                    "email", student.getEmail(),
                    "fullName", student.getFullName(),
                    "role", "STUDENT",
                    "department", student.getDepartment() != null ? student.getDepartment() : "",
                    "identifier", student.getRegisterNumber() != null ? student.getRegisterNumber() : "",
                    "mustResetPassword", Boolean.TRUE.equals(student.getMustResetPassword())
            );
        }

        throw new ApiException(HttpStatus.NOT_FOUND, "User profile not found");
    }

    private void registerAdminFailedAttempt(Admin admin) {
        int attempts = admin.getFailedAttempts() + 1;
        admin.setFailedAttempts(attempts);
        if (attempts >= lockoutAttempts) {
            admin.setLockedUntil(Instant.now().plusSeconds(lockoutMinutes * 60L));
        }
        adminRepository.save(admin);
    }

    private String issueRefreshToken(Admin admin) {
        String rawToken = UUID.randomUUID().toString().replace("-", "") +
                UUID.randomUUID().toString().replace("-", "");
        String hash = hashToken(rawToken);

        RefreshToken entity = RefreshToken.builder()
                .admin(admin)
                .tokenHash(hash)
                .expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .build();
        refreshTokenRepository.save(entity);
        return rawToken;
    }

    private String hashToken(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedhash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : encodedhash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm missing", e);
        }
    }
}
