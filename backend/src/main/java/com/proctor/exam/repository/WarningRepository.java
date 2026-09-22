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
}
