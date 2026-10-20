package com.proctor.exam.service;

import com.proctor.exam.dto.DashboardChartsResponse;
import com.proctor.exam.dto.DashboardChartsResponse.LabelValue;
import com.proctor.exam.dto.DashboardChartsResponse.TimeSeriesPoint;
import com.proctor.exam.dto.DashboardStatsResponse;
import com.proctor.exam.dto.DashboardSummaryResponse;
import com.proctor.exam.entity.Admin;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.entity.Professor;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.AdminRepository;
import com.proctor.exam.repository.ExamAttemptRepository;
import com.proctor.exam.repository.ExamRepository;
import com.proctor.exam.repository.ProfessorRepository;
import com.proctor.exam.repository.ProctoringEventRepository;
import com.proctor.exam.repository.ProctoringSessionRepository;
import com.proctor.exam.repository.WarningRepository;
import org.springframework.http.HttpStatus;
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
    private final AdminRepository adminRepository;
    private final ProfessorRepository professorRepository;

    public AdminDashboardService(ExamRepository examRepository,
                                 ExamAttemptRepository attemptRepository,
                                 ProctoringEventRepository eventRepository,
                                 ProctoringSessionRepository sessionRepository,
                                 WarningRepository warningRepository,
                                 AdminRepository adminRepository,
                                 ProfessorRepository professorRepository) {
        this.examRepository = examRepository;
        this.attemptRepository = attemptRepository;
        this.eventRepository = eventRepository;
        this.sessionRepository = sessionRepository;
        this.warningRepository = warningRepository;
        this.adminRepository = adminRepository;
        this.professorRepository = professorRepository;
    }

    private List<Long> getProfessorOrExaminerExamIds(String staffEmail) {
        if (staffEmail == null || staffEmail.isBlank()) return null;
        String email = staffEmail.trim().toLowerCase();
        Admin admin = adminRepository.findByEmail(email).orElse(null);
        Professor prof = professorRepository.findByEmailIgnoreCase(email).orElse(null);

        boolean isProfessorRole = (admin != null && ("EXAMINER".equalsIgnoreCase(admin.getRole()) || "FACULTY".equalsIgnoreCase(admin.getRole()) || "PROFESSOR".equalsIgnoreCase(admin.getRole())))
                || (prof != null);
        if (!isProfessorRole) return null;

        Long adminId = admin != null ? admin.getId() : null;
        Long profId = prof != null ? prof.getId() : null;

        return examRepository.findAll().stream()
                .filter(e -> (adminId != null && e.getCreatedBy() != null && e.getCreatedBy().equals(adminId))
                        || (e.getAssignedProfessorEmail() != null && e.getAssignedProfessorEmail().equalsIgnoreCase(email))
                        || (e.getAssignedProfessorId() != null && ((adminId != null && e.getAssignedProfessorId().equals(adminId)) || (profId != null && e.getAssignedProfessorId().equals(profId)))))
                .map(Exam::getId)
                .toList();
    }

    @Transactional(readOnly = true)
    public DashboardSummaryResponse getSummary() {
        return getSummary(null);
    }

    @Transactional(readOnly = true)
    public DashboardSummaryResponse getSummary(String staffEmail) {
        List<Long> examIds = getProfessorOrExaminerExamIds(staffEmail);
        if (examIds != null) {
            if (examIds.isEmpty()) {
                return new DashboardSummaryResponse(0, 0, 0, 0, 0, 0);
            }
            List<Exam> examinerExams = examRepository.findAllById(examIds);
            long totalExams = examinerExams.size();
            long activeExams = examinerExams.stream().filter(e -> "PUBLISHED".equalsIgnoreCase(e.getStatus())).count();
            long completedAttempts = attemptRepository.countByExamIdInAndStatus(examIds, "SUBMITTED");
            long studentsCurrentlyWriting = attemptRepository.countByStatusAndActiveHeartbeatInExamIds(
                    "IN_PROGRESS", Instant.now().minusSeconds(60), examIds);
            Instant startOfDay = Instant.now().truncatedTo(ChronoUnit.DAYS);
            long warningsToday = warningRepository.countByCreatedAtAfterInExamIds(startOfDay, examIds);
            long highSeverityEventsToday = eventRepository.countBySeverityInAndOccurredAtAfterInExamIds(
                    List.of("HIGH", "CRITICAL"), startOfDay, examIds);

            return new DashboardSummaryResponse(
                    totalExams, activeExams, completedAttempts,
                    studentsCurrentlyWriting, warningsToday, highSeverityEventsToday);
        }

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
    public DashboardStatsResponse getStats() {
        return getStats(null);
    }

    @Transactional(readOnly = true)
    public DashboardStatsResponse getStats(String staffEmail) {
        List<Long> examIds = getProfessorOrExaminerExamIds(staffEmail);
        if (examIds != null) {
            if (examIds.isEmpty()) {
                return new DashboardStatsResponse(0, 0, 0, 0.0);
            }
            List<Exam> examinerExams = examRepository.findAllById(examIds);
            long activeExams = examinerExams.stream().filter(e -> "PUBLISHED".equalsIgnoreCase(e.getStatus())).count();
            long totalAttempts = attemptRepository.countByExamIdIn(examIds);
            long highRiskSessionsFlagged = attemptRepository.countByExamIdInAndFlaggedForReviewTrue(examIds);
            Double avg = attemptRepository.findAverageScoreInExamIds(examIds);
            double avgScore = avg != null ? Math.round(avg * 100.0) / 100.0 : 0.0;

            return new DashboardStatsResponse(activeExams, totalAttempts, highRiskSessionsFlagged, avgScore);
        }

        long activeExams = examRepository.countByStatus("PUBLISHED");
        long totalAttempts = attemptRepository.count();
        long highRiskSessionsFlagged = attemptRepository.countByFlaggedForReviewTrue();
        Double avg = attemptRepository.findAverageScore();
        double avgScore = avg != null ? Math.round(avg * 100.0) / 100.0 : 0.0;

        return new DashboardStatsResponse(
                activeExams, totalAttempts, highRiskSessionsFlagged, avgScore);
    }

    @Transactional(readOnly = true)
    public DashboardChartsResponse getCharts(Long examId) {
        return getCharts(examId, null);
    }

    @Transactional(readOnly = true)
    public DashboardChartsResponse getCharts(Long examId, String staffEmail) {
        List<Long> examIds = getProfessorOrExaminerExamIds(staffEmail);
        if (examIds != null) {
            if (examIds.isEmpty()) {
                // If professor has no exams created or assigned, all chart metrics must be empty
                return new DashboardChartsResponse(List.of(), List.of(), List.of(), List.of());
            }

            if (examId != null) {
                if (!examIds.contains(examId)) {
                    throw new ApiException(HttpStatus.FORBIDDEN,
                            "Access denied: As a Professor / Faculty, you can only view exams assigned to or created by you.");
                }
                return getChartsForSingleExam(examId);
            } else {
                return getChartsForExamIds(examIds);
            }
        }

        if (examId != null) {
            return getChartsForSingleExam(examId);
        }
        return getChartsForAllExams();
    }

    private DashboardChartsResponse getChartsForSingleExam(Long examId) {
        List<LabelValue> warningsByExam = List.of();

        List<LabelValue> warningsByType = eventRepository.countByEventType(examId).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        List<TimeSeriesPoint> timeline = eventRepository.countByHourSince(sevenDaysAgo, examId).stream()
                .map(row -> new TimeSeriesPoint((String) row[0], (Long) row[1]))
                .toList();

        List<LabelValue> scoreDistribution = attemptRepository.scoreDistribution(examId).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        return new DashboardChartsResponse(warningsByExam, warningsByType, timeline, scoreDistribution);
    }

    private DashboardChartsResponse getChartsForExamIds(List<Long> examIds) {
        if (examIds == null || examIds.isEmpty()) {
            return new DashboardChartsResponse(List.of(), List.of(), List.of(), List.of());
        }

        List<LabelValue> warningsByExam = eventRepository.countWarningsByExamIds(examIds).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        List<LabelValue> warningsByType = eventRepository.countByEventTypeInExamIds(examIds).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        List<TimeSeriesPoint> timeline = eventRepository.countByHourSinceInExamIds(sevenDaysAgo, examIds).stream()
                .map(row -> new TimeSeriesPoint((String) row[0], (Long) row[1]))
                .toList();

        List<LabelValue> scoreDistribution = attemptRepository.scoreDistributionInExamIds(examIds).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        return new DashboardChartsResponse(warningsByExam, warningsByType, timeline, scoreDistribution);
    }

    private DashboardChartsResponse getChartsForAllExams() {
        List<LabelValue> warningsByExam = eventRepository.countWarningsByExam().stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        List<LabelValue> warningsByType = eventRepository.countByEventType(null).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        List<TimeSeriesPoint> timeline = eventRepository.countByHourSince(sevenDaysAgo, null).stream()
                .map(row -> new TimeSeriesPoint((String) row[0], (Long) row[1]))
                .toList();

        List<LabelValue> scoreDistribution = attemptRepository.scoreDistribution(null).stream()
                .map(row -> new LabelValue((String) row[0], (Long) row[1]))
                .toList();

        return new DashboardChartsResponse(warningsByExam, warningsByType, timeline, scoreDistribution);
    }
}
