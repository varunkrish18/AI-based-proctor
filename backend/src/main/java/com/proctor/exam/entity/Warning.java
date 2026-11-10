package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "warnings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Warning {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    @JsonIgnore
    private ExamAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "triggered_by_event_id")
    @JsonIgnore
    private ProctoringEvent triggeredByEvent;

    /** 1st, 2nd, 3rd progressive warning level */
    @Column(nullable = false)
    private Short level;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "risk_score_at_time", nullable = false, precision = 6, scale = 2)
    private BigDecimal riskScoreAtTime;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
