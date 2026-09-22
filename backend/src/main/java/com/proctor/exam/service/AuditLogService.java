package com.proctor.exam.service;

import com.proctor.exam.entity.AuditLog;
import com.proctor.exam.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Central audit logging service. Writes one row per consequential admin action.
 * Callers pass actorId (email), action constant, and a human-readable details string.
 * IP is extracted from the current HTTP request context automatically.
 */
@Service
public class AuditLogService {

    private final AuditLogRepository repo;

    public AuditLogService(AuditLogRepository repo) {
        this.repo = repo;
    }

    /** Log an admin-initiated action. */
    public void logAdmin(String adminEmail, String action, String details) {
        repo.save(AuditLog.builder()
                .actorType("ADMIN")
                .actorId(adminEmail)
                .action(action)
                .details(details)
                .ipAddress(currentIp())
                .build());
    }

    /** Log a system-initiated action (e.g. auto-flag on risk threshold). */
    public void logSystem(String action, String details) {
        repo.save(AuditLog.builder()
                .actorType("SYSTEM")
                .actorId("system")
                .action(action)
                .details(details)
                .build());
    }

    /** Extract IP from the current request, honouring X-Forwarded-For for proxied deployments. */
    private String currentIp() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest req = attrs.getRequest();
            String forwarded = req.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                return forwarded.split(",")[0].trim();
            }
            return req.getRemoteAddr();
        } catch (Exception e) {
            return null;
        }
    }
}
