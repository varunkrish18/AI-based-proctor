package com.proctor.exam.repository;

import com.proctor.exam.entity.ProctoringSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProctoringSessionRepository extends JpaRepository<ProctoringSession, Long> {
    Optional<ProctoringSession> findByAttemptId(Long attemptId);
    Optional<ProctoringSession> findByAttemptIdAndAttemptStudentEmailIgnoreCase(Long attemptId, String studentEmail);
}
