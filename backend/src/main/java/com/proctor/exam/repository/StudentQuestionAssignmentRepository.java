package com.proctor.exam.repository;

import com.proctor.exam.entity.StudentQuestionAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StudentQuestionAssignmentRepository extends JpaRepository<StudentQuestionAssignment, Long> {
    Optional<StudentQuestionAssignment> findByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);
    List<StudentQuestionAssignment> findByExamIdOrderByStudentEmailAsc(Long examId);
    void deleteByExamId(Long examId);
}
