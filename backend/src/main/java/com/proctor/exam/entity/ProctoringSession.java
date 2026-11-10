package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;

@Entity
@Table(name = "proctoring_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProctoringSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false, unique = true)
    @JsonIgnore
    private ExamAttempt attempt;

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

    /** ACTIVE, LOST, DENIED, UNKNOWN */
    @Column(name = "webcam_status", nullable = false, length = 20)
    @Builder.Default
    private String webcamStatus = "UNKNOWN";

    /** ACTIVE, LOST, DENIED, UNKNOWN */
    @Column(name = "microphone_status", nullable = false, length = 20)
    @Builder.Default
    private String microphoneStatus = "UNKNOWN";

    /** ACTIVE, LOST, DENIED, UNKNOWN */
    @Column(name = "screen_status", nullable = false, length = 20)
    @Builder.Default
    private String screenStatus = "UNKNOWN";

    /** ONLINE, RECONNECTING, OFFLINE */
    @Column(name = "connection_status", nullable = false, length = 20)
    @Builder.Default
    private String connectionStatus = "UNKNOWN";

    @Column(name = "started_at", nullable = false)
    @Builder.Default
    private Instant startedAt = Instant.now();

    @Column(name = "last_heartbeat_at")
    private Instant lastHeartbeatAt;

    @Column(name = "ended_at")
    private Instant endedAt;
}
