package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ExamAttemptRepository extends JpaRepository<ExamAttempt, Long>,
        JpaSpecificationExecutor<ExamAttempt> {

    List<ExamAttempt> findByExamIdAndStudentEmailIgnoreCaseOrderByAttemptNumberDesc(Long examId, String studentEmail);

    Optional<ExamAttempt> findByIdAndStudentEmailIgnoreCase(Long id, String studentEmail);

    long countByExamIdAndStudentEmailIgnoreCase(Long examId, String studentEmail);

    List<ExamAttempt> findByExamId(Long examId);

    long countByStatus(String status);

    long countByFlaggedForReviewTrue();

    Optional<ExamAttempt> findTopByStudentEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(String studentEmail, String status);

    @Query("SELECT AVG(a.score) FROM ExamAttempt a WHERE a.status = 'SUBMITTED' AND a.score IS NOT NULL")
    Double findAverageScore();

    /**
     * Students currently writing = IN_PROGRESS attempts whose proctoring session
     * had a heartbeat within the last 60 seconds.
     */
    @Query("""
            SELECT COUNT(DISTINCT a.id) FROM ExamAttempt a
            JOIN ProctoringSession ps ON ps.attempt.id = a.id
            WHERE a.status = :status
            AND ps.lastHeartbeatAt > :since
            """)
    long countByStatusAndActiveHeartbeat(@Param("status") String status, @Param("since") Instant since);

    /**
     * Score distribution: bucket scores into 10-point ranges and count attempts per bucket.
     * Returns rows of [bucketLabel, count], e.g. ["0-10", 3].
     * Only counts SUBMITTED attempts with a non-null score.
     * examId=null means all exams.
     */
    @Query("""
            SELECT
              CONCAT(CAST(FLOOR(COALESCE(a.score, 0) / 10) * 10 AS string), '-',
                     CAST(FLOOR(COALESCE(a.score, 0) / 10) * 10 + 10 AS string)) AS bucket,
              COUNT(a) AS cnt
            FROM ExamAttempt a
            WHERE a.status = 'SUBMITTED'
            AND (:examId IS NULL OR a.exam.id = :examId)
            GROUP BY bucket
            ORDER BY MIN(a.score)
            """)
    List<Object[]> scoreDistribution(@Param("examId") Long examId);
}
