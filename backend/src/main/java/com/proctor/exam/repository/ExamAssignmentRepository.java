package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface ExamAssignmentRepository extends JpaRepository<ExamAssignment, Long> {
    Optional<ExamAssignment> findByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);
    boolean existsByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);
    List<ExamAssignment> findByExamIdOrderByCreatedAtDesc(Long examId);
    Optional<ExamAssignment> findByIdAndExamId(Long id, Long examId);

    @Query("SELECT a.exam.id FROM ExamAssignment a WHERE LOWER(a.studentEmail) = LOWER(:email)")
    Set<Long> findAssignedExamIdsByStudentEmail(@Param("email") String email);

    @Query("SELECT a.exam.id FROM ExamAssignment a WHERE LOWER(a.studentEmail) IN :identifiers")
    Set<Long> findAssignedExamIdsByStudentIdentifiers(@Param("identifiers") Collection<String> identifiers);

    @Query("SELECT LOWER(a.studentEmail) FROM ExamAssignment a WHERE a.exam.id = :examId")
    Set<String> findAssignedStudentEmailsByExamId(@Param("examId") Long examId);
}
