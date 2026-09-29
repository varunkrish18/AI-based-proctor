package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "exam_questions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @Column(name = "question_type", nullable = false, length = 20)
    @Builder.Default
    private String questionType = "MCQ"; // "MCQ" or "CODING"

    @Column(name = "problem_title")
    private String problemTitle;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    // MCQ specific columns (nullable for CODING questions)
    @Column(name = "option_a", columnDefinition = "TEXT")
    private String optionA;

    @Column(name = "option_b", columnDefinition = "TEXT")
    private String optionB;

    @Column(name = "option_c", columnDefinition = "TEXT")
    private String optionC;

    @Column(name = "option_d", columnDefinition = "TEXT")
    private String optionD;

    /** 0=A, 1=B, 2=C, 3=D for MCQ; null for CODING */
    @Column(name = "correct_answer")
    private Short correctAnswer;

    // Coding specific columns
    @Column(name = "code_template", columnDefinition = "TEXT")
    private String codeTemplate;

    @Column(name = "allowed_languages")
    @Builder.Default
    private String allowedLanguages = "python,javascript";

    @Column(name = "constraints", columnDefinition = "TEXT")
    private String constraints;

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<ExamQuestionTestCase> testCases = new ArrayList<>();

    @Column(nullable = false)
    @Builder.Default
    private BigDecimal marks = BigDecimal.ONE;

    @Column(name = "display_order", nullable = false)
    @Builder.Default
    private Integer displayOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
