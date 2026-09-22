package com.proctor.exam.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Central JWT issuing/parsing service.
 * Two kinds of tokens are issued:
 *  - ADMIN tokens: subject = admin email, claim "role" = ADMIN
 *  - STUDENT_SESSION tokens: subject = student email, claims "examId", "role" = STUDENT,
 *    issued only after successful email verification for a specific exam (see AuthController).
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long adminAccessMinutes;
    private final long studentSessionMinutes;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.admin-access-token-minutes}") long adminAccessMinutes,
            @Value("${app.jwt.student-session-token-minutes}") long studentSessionMinutes) {
        // Secret must be >= 32 bytes for HS256; enforced at startup via bean init below.
        byte[] bytes = secret.getBytes();
        if (bytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must be at least 32 bytes long");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.adminAccessMinutes = adminAccessMinutes;
        this.studentSessionMinutes = studentSessionMinutes;
    }

    public String generateAdminToken(String email, String role) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        claims.put("type", "ADMIN");
        return buildToken(claims, email, adminAccessMinutes * 60);
    }

    public String generateStudentSessionToken(String email, Long examId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", "STUDENT");
        claims.put("type", "STUDENT_SESSION");
        claims.put("examId", examId);
        return buildToken(claims, email, studentSessionMinutes * 60);
    }

    private String buildToken(Map<String, Object> claims, String subject, long ttlSeconds) {
        Instant now = Instant.now();
        return Jwts.builder()
                .claims(claims)
                .subject(subject)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key)
                .compact();
    }

    public String extractSubject(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public String extractRole(String token) {
        return extractAllClaims(token).get("role", String.class);
    }

    public Long extractExamId(String token) {
        Object v = extractAllClaims(token).get("examId");
        return v == null ? null : Long.valueOf(v.toString());
    }

    public boolean isTokenValid(String token) {
        try {
            return !extractAllClaims(token).getExpiration().before(new Date());
        } catch (Exception e) {
            return false;
        }
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        return resolver.apply(extractAllClaims(token));
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }
}
