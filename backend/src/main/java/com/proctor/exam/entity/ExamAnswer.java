package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "exam_answers", uniqueConstraints = @UniqueConstraint(columnNames = {"attempt_id", "question_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    @JsonIgnore
    private ExamAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    @JsonIgnore
    private ExamQuestion question;

    @Column(name = "selected_option")
    private Short selectedOption;

    @Column(name = "is_correct")
    private Boolean isCorrect;

    @Column(name = "marks_awarded")
    private BigDecimal marksAwarded;

    @Column(name = "answered_at")
    private Instant answeredAt;
}
