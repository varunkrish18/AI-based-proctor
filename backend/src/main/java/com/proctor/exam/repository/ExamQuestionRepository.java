package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {
    List<ExamQuestion> findByExamIdOrderByDisplayOrderAsc(Long examId);
    long countByExamId(Long examId);
    java.util.Optional<ExamQuestion> findByIdAndExamId(Long id, Long examId);
}
