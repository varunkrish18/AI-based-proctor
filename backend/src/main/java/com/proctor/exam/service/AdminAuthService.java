package com.proctor.exam.service;

import com.proctor.exam.dto.AdminLoginRequest;
import com.proctor.exam.dto.AuthResponse;
import com.proctor.exam.entity.Admin;
import com.proctor.exam.entity.RefreshToken;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.AdminRepository;
import com.proctor.exam.repository.RefreshTokenRepository;
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
import java.util.UUID;

@Service
public class AdminAuthService {

    private final AdminRepository adminRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditLogService auditLogService;

    @Value("${app.security.admin-lockout-attempts:5}")
    private int lockoutAttempts;

    @Value("${app.security.admin-lockout-minutes:15}")
    private int lockoutMinutes;

    @Value("${app.jwt.admin-access-token-minutes:60}")
    private long adminAccessMinutes;

    public AdminAuthService(AdminRepository adminRepository,
                            RefreshTokenRepository refreshTokenRepository,
                            PasswordEncoder passwordEncoder,
                            JwtService jwtService,
                            AuditLogService auditLogService) {
        this.adminRepository = adminRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.auditLogService = auditLogService;
    }

    @Transactional
    public AuthResponse login(AdminLoginRequest request) {
        String email = request.email().toLowerCase();
        Admin admin = adminRepository.findByEmail(email)
                .orElse(null);

        if (admin == null) {
            auditLogService.logAdmin(email, "ADMIN_LOGIN_FAILED", "Account not found");
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
        }

        if (admin.getLockedUntil() != null && admin.getLockedUntil().isAfter(Instant.now())) {
            auditLogService.logAdmin(email, "ADMIN_LOGIN_LOCKED", "Account locked");
            throw new ApiException(HttpStatus.LOCKED,
                    "Account locked due to repeated failed attempts. Try again later.");
        }

        if (!passwordEncoder.matches(request.password(), admin.getPasswordHash())) {
            registerFailedAttempt(admin);
            auditLogService.logAdmin(email, "ADMIN_LOGIN_FAILED", "Password mismatch");
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
        }

        admin.setFailedAttempts(0);
        admin.setLockedUntil(null);
        adminRepository.save(admin);

        String accessToken = jwtService.generateAdminToken(admin.getEmail(), admin.getRole());
        String rawRefreshToken = issueRefreshToken(admin);

        auditLogService.logAdmin(email, "ADMIN_LOGIN_SUCCESS", "Successful login");
        return new AuthResponse(accessToken, rawRefreshToken, adminAccessMinutes * 60);
    }

    @Transactional
    public AuthResponse refresh(String rawRefreshToken) {
        String hash = hashToken(rawRefreshToken);
        RefreshToken token = refreshTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token."));

        if (token.isRevoked() || token.isExpired()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Refresh token is expired or revoked.");
        }

        // Rotate: revoke old refresh token
        token.setRevokedAt(Instant.now());
        refreshTokenRepository.save(token);

        Admin admin = token.getAdmin();
        String newAccessToken = jwtService.generateAdminToken(admin.getEmail(), admin.getRole());
        String newRawRefreshToken = issueRefreshToken(admin);

        return new AuthResponse(newAccessToken, newRawRefreshToken, adminAccessMinutes * 60);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) return;
        String hash = hashToken(rawRefreshToken);
        refreshTokenRepository.findByTokenHash(hash).ifPresent(token -> {
            token.setRevokedAt(Instant.now());
            refreshTokenRepository.save(token);
            auditLogService.logAdmin(token.getAdmin().getEmail(), "ADMIN_LOGOUT", "Admin logged out and session revoked");
        });
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

    private void registerFailedAttempt(Admin admin) {
        int attempts = admin.getFailedAttempts() + 1;
        admin.setFailedAttempts(attempts);
        if (attempts >= lockoutAttempts) {
            admin.setLockedUntil(Instant.now().plusSeconds(lockoutMinutes * 60L));
        }
        adminRepository.save(admin);
    }
}
