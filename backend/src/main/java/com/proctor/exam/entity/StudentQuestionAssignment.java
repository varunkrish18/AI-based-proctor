package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Stores a pre-assigned subset of question IDs for a specific student within an exam.
 * When present, the student's exam session will serve exactly these questions
 * instead of performing a fresh random selection at start-time.
 */
@Entity
@Table(
    name = "student_question_assignments",
    uniqueConstraints = @UniqueConstraint(columnNames = {"exam_id", "student_email"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentQuestionAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @Column(name = "student_email", nullable = false)
    private String studentEmail;

    /** JSON array of exam_question IDs assigned to this student, e.g. "[3,7,12]" */
    @Column(name = "question_ids", nullable = false, columnDefinition = "TEXT")
    private String questionIds;

    @Column(name = "questions_per_student", nullable = false)
    @Builder.Default
    private Integer questionsPerStudent = 0;

    @Column(name = "assigned_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant assignedAt = Instant.now();
}
