package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ExamAssignmentRepository extends JpaRepository<ExamAssignment, Long> {
    Optional<ExamAssignment> findByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);
    boolean existsByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);
    java.util.List<ExamAssignment> findByExamIdOrderByCreatedAtDesc(Long examId);
    Optional<ExamAssignment> findByIdAndExamId(Long id, Long examId);
}
