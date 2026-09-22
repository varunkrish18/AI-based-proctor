package com.proctor.exam.repository;

import com.proctor.exam.entity.ProctoringEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface ProctoringEventRepository extends JpaRepository<ProctoringEvent, Long> {

    List<ProctoringEvent> findByAttemptIdOrderByOccurredAtAsc(Long attemptId);

    long countByAttemptIdAndEventType(Long attemptId, String eventType);

    @Query("SELECT e.severity, COUNT(e) FROM ProctoringEvent e WHERE e.attempt.id = :attemptId GROUP BY e.severity")
    List<Object[]> countSeveritiesByAttemptId(@Param("attemptId") Long attemptId);

    @Query("""
            SELECT e FROM ProctoringEvent e WHERE e.attempt.id = :attemptId
            AND (:severity IS NULL OR e.severity = :severity)
            AND (:eventType IS NULL OR e.eventType = :eventType)
            ORDER BY e.occurredAt ASC
            """)
    List<ProctoringEvent> findByAttemptIdFiltered(@Param("attemptId") Long attemptId,
                                                  @Param("severity") String severity,
                                                  @Param("eventType") String eventType);

    long countBySeverityInAndOccurredAtAfter(List<String> severities, Instant since);

    /**
     * Count events grouped by exam name — for dashboard "warnings by exam" chart.
     * Returns rows of [examName, count].
     */
    @Query("""
            SELECT e.attempt.exam.name, COUNT(e)
            FROM ProctoringEvent e
            GROUP BY e.attempt.exam.name
            ORDER BY COUNT(e) DESC
            """)
    List<Object[]> countWarningsByExam();

    /**
     * Count events grouped by event type — optionally scoped to one exam.
     * Returns rows of [eventType, count].
     */
    @Query("""
            SELECT e.eventType, COUNT(e)
            FROM ProctoringEvent e
            WHERE (:examId IS NULL OR e.attempt.exam.id = :examId)
            GROUP BY e.eventType
            ORDER BY COUNT(e) DESC
            """)
    List<Object[]> countByEventType(@Param("examId") Long examId);

    /**
     * Count events per hour since a cutoff — for warnings timeline chart.
     * Returns rows of [hourLabel (ISO string truncated to hour), count].
     * examId=null means all exams.
     */
    @Query(value = """
            SELECT TO_CHAR(DATE_TRUNC('hour', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00') AS hour,
                   COUNT(*) AS cnt
            FROM proctoring_events pe
            JOIN exam_attempts ea ON ea.id = pe.attempt_id
            WHERE pe.occurred_at >= :since
            AND (:examId IS NULL OR ea.exam_id = :examId)
            GROUP BY hour
            ORDER BY hour
            """, nativeQuery = true)
    List<Object[]> countByHourSince(@Param("since") Instant since, @Param("examId") Long examId);
}
