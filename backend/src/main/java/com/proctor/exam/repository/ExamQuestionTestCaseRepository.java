package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamQuestionTestCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamQuestionTestCaseRepository extends JpaRepository<ExamQuestionTestCase, Long> {
    List<ExamQuestionTestCase> findByQuestionIdOrderByDisplayOrderAsc(Long questionId);
    List<ExamQuestionTestCase> findByQuestionIdAndIsHiddenFalseOrderByDisplayOrderAsc(Long questionId);
}
