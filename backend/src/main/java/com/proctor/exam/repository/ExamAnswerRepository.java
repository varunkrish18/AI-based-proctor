package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamAnswerRepository extends JpaRepository<ExamAnswer, Long> {
    List<ExamAnswer> findByAttemptId(Long attemptId);
    List<ExamAnswer> findByAttemptIdIn(List<Long> attemptIds);
    Optional<ExamAnswer> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);
}

