package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "proctoring_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProctoringEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    @JsonIgnore
    private ProctoringSession session;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    @JsonIgnore
    private ExamAttempt attempt;

    /**
     * TAB_SWITCH, FULLSCREEN_EXIT, SCREEN_CAPTURE_STOPPED,
     * WEBCAM_LOST, MICROPHONE_LOST, LOCATION_DENIED, etc.
     */
    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    /** INFO, LOW, MEDIUM, HIGH, CRITICAL */
    @Column(nullable = false, length = 20)
    private String severity;

    @Column(nullable = false, precision = 4, scale = 3)
    @Builder.Default
    private BigDecimal confidence = BigDecimal.ONE;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "duration_seconds", precision = 8, scale = 2)
    private BigDecimal durationSeconds;

    @Column(name = "metadata", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String metadata;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
