package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "exams")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Exam {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String subject;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    @Column(name = "num_questions", nullable = false)
    private Integer numQuestions;

    @Column(name = "passing_marks", nullable = false)
    @Builder.Default
    private BigDecimal passingMarks = BigDecimal.ZERO;

    @Column(name = "negative_marking", nullable = false)
    @Builder.Default
    private BigDecimal negativeMarking = BigDecimal.ZERO;

    @Column(name = "randomize_questions", nullable = false)
    @Builder.Default
    private Boolean randomizeQuestions = true;

    @Column(name = "randomize_options", nullable = false)
    @Builder.Default
    private Boolean randomizeOptions = true;

    @Column(name = "max_attempts", nullable = false)
    @Builder.Default
    private Integer maxAttempts = 1;

    @Column(name = "webcam_required", nullable = false)
    @Builder.Default
    private Boolean webcamRequired = true;

    @Column(name = "microphone_required", nullable = false)
    @Builder.Default
    private Boolean microphoneRequired = true;

    @Column(name = "screen_required", nullable = false)
    @Builder.Default
    private Boolean screenRequired = true;

    @Column(name = "location_required", nullable = false)
    @Builder.Default
    private Boolean locationRequired = false;

    public static final String DEFAULT_PROCTORING_CONFIG = "{\"faceMissingSeconds\":5,\"multiFaceMinConsecutive\":2,\"lookAwayLowSeconds\":2,\"lookAwayMediumSeconds\":5,\"lookAwayRepeatWindowSeconds\":120,\"lookAwayRepeatThreshold\":3,\"tabSwitchLowSeconds\":2,\"tabSwitchMediumSeconds\":5,\"maxWarnings\":10,\"autoActionOnMaxWarnings\":\"FLAG_FOR_REVIEW\",\"weights\":{\"TAB_SWITCH\":10,\"FULLSCREEN_EXIT\":10,\"FACE_NOT_VISIBLE\":15,\"MULTIPLE_FACES\":30,\"LOOKING_LEFT\":10,\"LOOKING_RIGHT\":10,\"LOOKING_UP\":10,\"LOOKING_DOWN\":10,\"HEAD_TURNED\":15,\"SCREEN_CAPTURE_STOPPED\":30,\"WEBCAM_LOST\":20,\"MICROPHONE_LOST\":15}}";

    @Column(name = "proctoring_config", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    @Builder.Default
    private String proctoringConfig = DEFAULT_PROCTORING_CONFIG;

    /** DRAFT, PUBLISHED, CLOSED */
    @Column(nullable = false)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
