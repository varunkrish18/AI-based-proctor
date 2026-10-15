package com.proctor.exam.repository;

import com.proctor.exam.entity.Warning;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface WarningRepository extends JpaRepository<Warning, Long> {

    List<Warning> findByAttemptIdOrderByCreatedAtAsc(Long attemptId);

    Optional<Warning> findTopByAttemptIdOrderByCreatedAtDesc(Long attemptId);

    long countByAttemptId(Long attemptId);

    long countByCreatedAtAfter(Instant since);

    @org.springframework.data.jpa.repository.Query("""
            SELECT COUNT(w) FROM Warning w
            WHERE w.attempt.exam.id IN :examIds
            AND w.createdAt >= :since
            """)
    long countByCreatedAtAfterInExamIds(@org.springframework.data.repository.query.Param("since") Instant since,
                                        @org.springframework.data.repository.query.Param("examIds") List<Long> examIds);
}
