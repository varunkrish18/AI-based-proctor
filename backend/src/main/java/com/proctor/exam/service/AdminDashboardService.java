package com.proctor.exam.service;

import com.proctor.exam.dto.DashboardChartsResponse;
import com.proctor.exam.dto.DashboardChartsResponse.LabelValue;
import com.proctor.exam.dto.DashboardChartsResponse.TimeSeriesPoint;
import com.proctor.exam.dto.DashboardSummaryResponse;
import com.proctor.exam.repository.ExamAttemptRepository;
import com.proctor.exam.repository.ExamRepository;
import com.proctor.exam.repository.ProctoringEventRepository;
import com.proctor.exam.repository.ProctoringSessionRepository;
import com.proctor.exam.repository.WarningRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class AdminDashboardService {

    private final ExamRepository examRepository;
    private final ExamAttemptRepository attemptRepository;
    private final ProctoringEventRepository eventRepository;
    private final ProctoringSessionRepository sessionRepository;
    private final WarningRepository warningRepository;

    public AdminDashboardService(ExamRepository examRepository,
                                 ExamAttemptRepository attemptRepository,
                                 ProctoringEventRepository eventRepository,
                                 ProctoringSessionRepository sessionRepository,
                                 WarningRepository warningRepository) {
        this.examRepository = examRepository;
        this.attemptRepository = attemptRepository;
        this.eventRepository = eventRepository;
        this.sessionRepository = sessionRepository;
        this.warningRepository = warningRepository;
    }

    @Transactional(readOnly = true)
    public DashboardSummaryResponse getSummary() {
        long totalExams = examRepository.count();
        long activeExams = examRepository.countByStatus("PUBLISHED");
        long completedAttempts = attemptRepository.countByStatus("SUBMITTED");
        long studentsCurrentlyWriting = attemptRepository.countByStatusAndActiveHeartbeat(
                "IN_PROGRESS", Instant.now().minusSeconds(60));
        Instant startOfDay = Instant.now().truncatedTo(ChronoUnit.DAYS);
        long warningsToday = warningRepository.countByCreatedAtAfter(startOfDay);
        long highSeverityEventsToday = eventRepository.countBySeverityInAndOccurredAtAfter(
                List.of("HIGH", "CRITICAL"), startOfDay);

        return new DashboardSummaryResponse(
                totalExams, activeExams, completedAttempts,
                studentsCurrentlyWriting, warningsToday, highSeverityEventsToday);
    }

    @Transactional(readOnly = true)
    public com.proctor.exam.dto.DashboardStatsResponse getStats() {
        long activeExams = examRepository.countByStatus("PUBLISHED");
        long totalAttempts = attemptRepository.count();
        long highRiskSessionsFlagged = attemptRepository.countByFlaggedForReviewTrue();
        Double avg = attemptRepository.findAverageScore();
        double avgScore = avg != null ? Math.round(avg * 100.0) / 100.0 : 0.0;

        return new com.proctor.exam.dto.DashboardStatsResponse(
                activeExams, totalAttempts, highRiskSessionsFlagged, avgScore);
    }

    @Transactional(readOnly = true)
    public DashboardChartsResponse getCharts(Long examId) {
        // 1. Warnings by exam (top 10)
        List<LabelValue> warningsByExam = examId != null
                ? List.of() // filtered to single exam — not applicable as a distribution chart
                : eventRepository.countWarningsByExam().stream()
                        .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                        .toList();

        // 2. Warnings by event type (optionally scoped to one exam)
        List<LabelValue> warningsByType = eventRepository.countByEventType(examId).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        // 3. Warnings timeline — hourly buckets over last 7 days
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        List<TimeSeriesPoint> timeline = eventRepository.countByHourSince(sevenDaysAgo, examId).stream()
                .map(row -> new TimeSeriesPoint((String) row[0], (Long) row[1]))
                .toList();

        // 4. Score distribution — attempt scores grouped in 10-pt buckets
        List<LabelValue> scoreDistribution = attemptRepository.scoreDistribution(examId).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        return new DashboardChartsResponse(warningsByExam, warningsByType, timeline, scoreDistribution);
    }
}
