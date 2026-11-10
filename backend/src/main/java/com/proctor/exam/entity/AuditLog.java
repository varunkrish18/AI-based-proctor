package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** ADMIN, STUDENT, SYSTEM */
    @Column(name = "actor_type", nullable = false, length = 20)
    private String actorType;

    /** email for admins/students, service name for SYSTEM */
    @Column(name = "actor_id", length = 255)
    private String actorId;

    /** e.g. ADMIN_LOGIN, EXAM_PUBLISH, REPORT_EXPORT, QUESTION_ADD */
    @Column(nullable = false, length = 100)
    private String action;

    @Column(columnDefinition = "TEXT")
    private String details;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
