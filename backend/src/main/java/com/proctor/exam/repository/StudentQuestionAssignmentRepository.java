package com.proctor.exam.repository;

import com.proctor.exam.entity.StudentQuestionAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface StudentQuestionAssignmentRepository extends JpaRepository<StudentQuestionAssignment, Long> {
    Optional<StudentQuestionAssignment> findByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);
    List<StudentQuestionAssignment> findByExamIdOrderByStudentEmailAsc(Long examId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM StudentQuestionAssignment s WHERE s.exam.id = :examId")
    void deleteByExamId(@Param("examId") Long examId);
}
