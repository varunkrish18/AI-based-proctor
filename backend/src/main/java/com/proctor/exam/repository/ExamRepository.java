package com.proctor.exam.repository;

import com.proctor.exam.entity.Exam;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface ExamRepository extends JpaRepository<Exam, Long> {
    List<Exam> findByStatus(String status);
    List<Exam> findByStatusAndStartAtBeforeAndEndAtAfter(String status, Instant now1, Instant now2);
    long countByStatus(String status);
}
