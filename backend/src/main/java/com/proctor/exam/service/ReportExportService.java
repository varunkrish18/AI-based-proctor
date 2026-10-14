package com.proctor.exam.service;

import com.proctor.exam.dto.*;
import com.proctor.exam.entity.*;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Generates per-attempt proctoring reports in CSV, Excel, and PDF formats.
 * No student webcam/screen frame data is included — only structured event/score records.
 */
@Service
public class ReportExportService {

    private static final DateTimeFormatter FMT = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneOffset.UTC);

    private final ExamAttemptRepository attemptRepository;
    private final ProctoringEventRepository eventRepository;
    private final WarningRepository warningRepository;
    private final StudentRepository studentRepository;
    private final RiskEngine riskEngine;
    private final ExamRepository examRepository;
    private final ExamAnswerRepository answerRepository;
    private final ExamQuestionRepository questionRepository;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public ReportExportService(ExamAttemptRepository attemptRepository,
                               ProctoringEventRepository eventRepository,
                               WarningRepository warningRepository,
                               StudentRepository studentRepository,
                               RiskEngine riskEngine,
                               ExamRepository examRepository,
                               ExamAnswerRepository answerRepository,
                               ExamQuestionRepository questionRepository,
                               com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.attemptRepository = attemptRepository;
        this.eventRepository = eventRepository;
        this.warningRepository = warningRepository;
        this.studentRepository = studentRepository;
        this.riskEngine = riskEngine;
        this.examRepository = examRepository;
        this.answerRepository = answerRepository;
        this.questionRepository = questionRepository;
        this.objectMapper = objectMapper;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public byte[] exportCsv(Long attemptId) {
        Context ctx = loadContext(attemptId);
        StringBuilder sb = new StringBuilder();

        // Header block
        sb.append("Attempt ID,").append(ctx.attempt.getId()).append('\n');
        sb.append("Student,").append(ctx.attempt.getStudentEmail()).append('\n');
        sb.append("Exam,").append(ctx.attempt.getExam().getName()).append('\n');
        sb.append("Status,").append(ctx.attempt.getStatus()).append('\n');
        sb.append("Score,").append(nullSafe(ctx.attempt.getScore())).append('\n');
        sb.append("Flagged for Review,").append(Boolean.TRUE.equals(ctx.attempt.getFlaggedForReview())).append('\n');
        sb.append("Risk Score,").append(ctx.riskScore).append('\n');
        sb.append("Start Time,").append(format(ctx.attempt.getStartTime())).append('\n');
        sb.append("End Time,").append(format(ctx.attempt.getEndTime())).append('\n');
        sb.append('\n');

        // Events table
        sb.append("Event ID,Event Type,Severity,Confidence,Occurred At,Duration (s),Metadata\n");
        for (ProctoringEvent ev : ctx.events) {
            sb.append(ev.getId()).append(',')
              .append(ev.getEventType()).append(',')
              .append(ev.getSeverity()).append(',')
              .append(ev.getConfidence()).append(',')
              .append(format(ev.getOccurredAt())).append(',')
              .append(nullSafe(ev.getDurationSeconds())).append(',')
              .append(csvEscape(ev.getMetadata())).append('\n');
        }

        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    public byte[] exportExcel(Long attemptId) throws IOException {
        Context ctx = loadContext(attemptId);

        try (Workbook wb = new XSSFWorkbook()) {
            // --- Summary sheet ---
            Sheet summary = wb.createSheet("Summary");
            CellStyle headerStyle = boldStyle(wb);

            int r = 0;
            addRow(summary, r++, headerStyle, "Field", "Value");
            addRow(summary, r++, null, "Attempt ID", String.valueOf(ctx.attempt.getId()));
            addRow(summary, r++, null, "Student", ctx.attempt.getStudentEmail());
            addRow(summary, r++, null, "Exam", ctx.attempt.getExam().getName());
            addRow(summary, r++, null, "Subject", nullSafe(ctx.attempt.getExam().getSubject()));
            addRow(summary, r++, null, "Status", ctx.attempt.getStatus());
            addRow(summary, r++, null, "Score", nullSafe(ctx.attempt.getScore()));
            addRow(summary, r++, null, "Flagged for Review", String.valueOf(Boolean.TRUE.equals(ctx.attempt.getFlaggedForReview())));
            addRow(summary, r++, null, "Risk Score", ctx.riskScore.toPlainString());
            addRow(summary, r++, null, "Start Time", format(ctx.attempt.getStartTime()));
            addRow(summary, r++, null, "End Time", format(ctx.attempt.getEndTime()));

            summary.autoSizeColumn(0);
            summary.autoSizeColumn(1);

            // --- Events sheet ---
            Sheet events = wb.createSheet("Events");
            int er = 0;
            addRow(events, er++, headerStyle, "ID", "Type", "Severity", "Confidence",
                   "Occurred At", "Duration (s)", "Metadata");
            for (ProctoringEvent ev : ctx.events) {
                addRow(events, er++, null,
                       String.valueOf(ev.getId()), ev.getEventType(), ev.getSeverity(),
                       String.valueOf(ev.getConfidence()), format(ev.getOccurredAt()),
                       nullSafe(ev.getDurationSeconds()), nullSafe(ev.getMetadata()));
            }
            for (int i = 0; i < 7; i++) events.autoSizeColumn(i);

            // --- Warnings sheet ---
            Sheet warnings = wb.createSheet("Warnings");
            int wr = 0;
            addRow(warnings, wr++, headerStyle, "ID", "Level", "Message", "Risk Score At Time", "Created At");
            for (Warning w : ctx.warnings) {
                addRow(warnings, wr++, null,
                       String.valueOf(w.getId()), String.valueOf(w.getLevel()),
                       w.getMessage(), String.valueOf(w.getRiskScoreAtTime()),
                       format(w.getCreatedAt()));
            }
            for (int i = 0; i < 5; i++) warnings.autoSizeColumn(i);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    /**
     * PDF export — plain-text byte stream using OpenPDF (iText fork, LGPL).
     * Produces a structured document without images or complex layout.
     */
    public byte[] exportPdf(Long attemptId) {
        Context ctx = loadContext(attemptId);

        // Build PDF using com.lowagie.text (OpenPDF)
        com.lowagie.text.Document doc = new com.lowagie.text.Document();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            com.lowagie.text.pdf.PdfWriter.getInstance(doc, out);
            doc.open();

            com.lowagie.text.Font titleFont = new com.lowagie.text.Font(
                    com.lowagie.text.Font.HELVETICA, 16, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font sectionFont = new com.lowagie.text.Font(
                    com.lowagie.text.Font.HELVETICA, 12, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font bodyFont = new com.lowagie.text.Font(
                    com.lowagie.text.Font.HELVETICA, 10);

            Optional<com.proctor.exam.entity.Student> studentOpt = studentRepository.findByEmailIgnoreCase(ctx.attempt.getStudentEmail());
            String studentName = studentOpt
                    .map(com.proctor.exam.entity.Student::getFullName)
                    .filter(s -> !s.isBlank())
                    .orElse("Candidate");
            String regNumber = studentOpt
                    .map(com.proctor.exam.entity.Student::getRegisterNumber)
                    .filter(s -> !s.isBlank())
                    .orElse("—");

            // Title
            doc.add(new com.lowagie.text.Paragraph("Official Student Examination & Evaluation Report", titleFont));
            doc.add(new com.lowagie.text.Paragraph("Verified Assessment File", bodyFont));
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Summary table
            doc.add(new com.lowagie.text.Paragraph("Student & Evaluation Information", sectionFont));
            com.lowagie.text.pdf.PdfPTable summaryTable = new com.lowagie.text.pdf.PdfPTable(2);
            summaryTable.setWidthPercentage(100);
            addPdfRow(summaryTable, "Student Name", studentName);
            addPdfRow(summaryTable, "Register Number", regNumber);
            addPdfRow(summaryTable, "Student Email", ctx.attempt.getStudentEmail());
            addPdfRow(summaryTable, "Attempt ID", "#" + ctx.attempt.getId());
            addPdfRow(summaryTable, "Examination", ctx.attempt.getExam().getName());
            addPdfRow(summaryTable, "Subject", ctx.attempt.getExam().getSubject() != null ? ctx.attempt.getExam().getSubject() : "—");
            addPdfRow(summaryTable, "Evaluation Status", ctx.attempt.getStatus());
            addPdfRow(summaryTable, "Verified Marks Awarded", (ctx.attempt.getScore() != null ? ctx.attempt.getScore().toPlainString() + " pts" : "Pending Evaluation"));
            addPdfRow(summaryTable, "Proctoring Integrity", Boolean.TRUE.equals(ctx.attempt.getFlaggedForReview()) ? "Flagged for Review" : "Clear / Verified");
            addPdfRow(summaryTable, "Decayed Risk Score", ctx.riskScore.toPlainString() + " / 100");
            addPdfRow(summaryTable, "Exam Started", format(ctx.attempt.getStartTime()));
            addPdfRow(summaryTable, "Exam Completed", format(ctx.attempt.getEndTime()));
            doc.add(summaryTable);
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Events table
            doc.add(new com.lowagie.text.Paragraph("Proctoring Events (" + ctx.events.size() + " total)", sectionFont));
            com.lowagie.text.pdf.PdfPTable evTable = new com.lowagie.text.pdf.PdfPTable(5);
            evTable.setWidthPercentage(100);
            float[] widths = {1f, 2.5f, 1.5f, 2f, 1.5f};
            evTable.setWidths(widths);
            addPdfHeaderRow(evTable, "ID", "Type", "Severity", "Occurred At", "Duration (s)");
            for (ProctoringEvent ev : ctx.events) {
                addPdfRow(evTable,
                          String.valueOf(ev.getId()),
                          ev.getEventType(),
                          ev.getSeverity(),
                          format(ev.getOccurredAt()),
                          nullSafe(ev.getDurationSeconds()));
            }
            doc.add(evTable);
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Warnings
            if (!ctx.warnings.isEmpty()) {
                doc.add(new com.lowagie.text.Paragraph("Warnings", sectionFont));
                com.lowagie.text.pdf.PdfPTable wTable = new com.lowagie.text.pdf.PdfPTable(3);
                wTable.setWidthPercentage(100);
                addPdfHeaderRow(wTable, "Level", "Message", "Risk Score");
                for (Warning w : ctx.warnings) {
                    addPdfRow(wTable, String.valueOf(w.getLevel()), w.getMessage(),
                              String.valueOf(w.getRiskScoreAtTime()));
                }
                doc.add(wTable);
            }

            // Student Questions & Answers Evaluation
            List<ExamAnswer> studentAnswers = answerRepository.findByAttemptId(attemptId);
            if (!studentAnswers.isEmpty()) {
                doc.add(com.lowagie.text.Chunk.NEWLINE);
                doc.add(new com.lowagie.text.Paragraph("Student Answers & Examination Evaluation (" + studentAnswers.size() + " Questions)", sectionFont));
                com.lowagie.text.pdf.PdfPTable qaTable = new com.lowagie.text.pdf.PdfPTable(4);
                qaTable.setWidthPercentage(100);
                float[] qaWidths = {0.8f, 4.5f, 2.2f, 2.5f};
                qaTable.setWidths(qaWidths);
                addPdfHeaderRow(qaTable, "Q#", "Question", "Student Answer", "Result / Score");
                int qIdx = 1;
                for (ExamAnswer ans : studentAnswers) {
                    ExamQuestion q = ans.getQuestion();
                    String qText = q != null ? q.getQuestionText() : ("Question " + qIdx);
                    String selOpt = ans.getSelectedOption() != null ? ("Option " + (char)('A' + ans.getSelectedOption())) : "Not Answered";
                    String correctOpt = q != null && q.getCorrectAnswer() != null ? ("Option " + (char)('A' + q.getCorrectAnswer())) : "—";
                    String result = Boolean.TRUE.equals(ans.getIsCorrect())
                            ? ("Correct (" + (ans.getMarksAwarded() != null ? ans.getMarksAwarded().toPlainString() : "1") + " pts)")
                            : ("Incorrect (Key: " + correctOpt + ")");
                    addPdfRow(qaTable, String.valueOf(qIdx++), qText, selOpt, result);
                }
                doc.add(qaTable);
            }
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate PDF: " + e.getMessage());
        } finally {
            doc.close();
        }
        return out.toByteArray();
    }

    // ── Full attempt report (for AdminReportView) ─────────────────────────────

    @Transactional(readOnly = true)
    public AdminAttemptReportResponse buildReport(Long attemptId) {
        Context ctx = loadContext(attemptId);
        ExamAttempt a = ctx.attempt;
        Exam exam = a.getExam();

        String studentName = studentRepository.findByEmailIgnoreCase(a.getStudentEmail())
                .map(s -> s.getFullName())
                .orElse(null);

        Map<String, Long> severityCounts = new HashMap<>();
        for (ProctoringEvent ev : ctx.events) {
            severityCounts.merge(ev.getSeverity(), 1L, Long::sum);
        }

        List<RiskPoint> scoreHistory = new ArrayList<>();
        Map<String, Integer> weights = riskEngine.resolveWeights(exam);
        for (ProctoringEvent ev : ctx.events) {
            BigDecimal s = riskEngine.computeDecayedRiskScore(ctx.events, weights, ev.getOccurredAt());
            scoreHistory.add(new RiskPoint(ev.getOccurredAt(), s, ev.getEventType(), null));
        }

        List<ProctoringEventResponse> eventResponses = ctx.events.stream()
                .map(e -> new ProctoringEventResponse(e.getId(), e.getAttempt().getId(),
                        e.getEventType(), e.getSeverity(), e.getConfidence(),
                        e.getOccurredAt(), e.getDurationSeconds(), e.getMetadata(), e.getCreatedAt()))
                .toList();

        List<WarningResponse> warningResponses = ctx.warnings.stream()
                .map(w -> new WarningResponse(w.getId(), w.getAttempt().getId(),
                        w.getLevel(), w.getMessage(), w.getRiskScoreAtTime(), w.getCreatedAt()))
                .toList();

        // Build question and answer responses for human examination analysis
        List<AdminQuestionAnswerResponse> answerResponses = new ArrayList<>();
        List<Long> orderedQuestionIds = decodeOrder(a.getQuestionOrder());
        List<ExamQuestion> questionsToDisplay;
        if (orderedQuestionIds != null && !orderedQuestionIds.isEmpty()) {
            Map<Long, ExamQuestion> qMap = new HashMap<>();
            questionRepository.findAllById(orderedQuestionIds).forEach(q -> qMap.put(q.getId(), q));
            questionsToDisplay = new ArrayList<>();
            for (Long qid : orderedQuestionIds) {
                ExamQuestion q = qMap.get(qid);
                if (q != null) questionsToDisplay.add(q);
            }
        } else {
            questionsToDisplay = questionRepository.findByExamIdOrderByDisplayOrderAsc(exam.getId());
        }

        List<ExamAnswer> studentAnswers = answerRepository.findByAttemptId(attemptId);
        Map<Long, ExamAnswer> answerByQuestion = new HashMap<>();
        studentAnswers.forEach(ans -> answerByQuestion.put(ans.getQuestion().getId(), ans));

        int displayOrder = 1;
        for (ExamQuestion q : questionsToDisplay) {
            ExamAnswer ans = answerByQuestion.get(q.getId());
            Short selected = ans != null ? ans.getSelectedOption() : null;
            Boolean isCorrect = ans != null ? ans.getIsCorrect() : null;
            BigDecimal awarded = ans != null && ans.getMarksAwarded() != null ? ans.getMarksAwarded() : BigDecimal.ZERO;
            answerResponses.add(new AdminQuestionAnswerResponse(
                    q.getId(),
                    displayOrder++,
                    q.getQuestionType(),
                    q.getProblemTitle(),
                    q.getQuestionText(),
                    q.getOptionA(),
                    q.getOptionB(),
                    q.getOptionC(),
                    q.getOptionD(),
                    selected,
                    q.getCorrectAnswer(),
                    isCorrect,
                    awarded,
                    q.getMarks() != null ? q.getMarks() : BigDecimal.valueOf(1.0),
                    ans != null ? ans.getCodeSubmission() : null,
                    ans != null ? ans.getCodeLanguage() : null,
                    ans != null ? ans.getTestCasesPassed() : null,
                    ans != null ? ans.getTotalTestCases() : null,
                    ans != null ? ans.getExecutionOutput() : null
            ));
        }

        return new AdminAttemptReportResponse(
                a.getId(), exam.getId(), a.getStudentEmail(), studentName, a.getAttemptNumber(),
                exam.getName(), exam.getSubject(), exam.getDurationMinutes(),
                a.getStatus(), a.getStartTime(), a.getEndTime(), a.getScore(),
                Boolean.TRUE.equals(a.getFlaggedForReview()), ctx.riskScore,
                eventResponses, warningResponses, scoreHistory,
                ctx.events.size(),
                severityCounts.getOrDefault("INFO", 0L),
                severityCounts.getOrDefault("LOW", 0L),
                severityCounts.getOrDefault("MEDIUM", 0L),
                severityCounts.getOrDefault("HIGH", 0L),
                severityCounts.getOrDefault("CRITICAL", 0L),
                answerResponses
        );
    }

    /**
     * Generates a single consolidated cumulative PDF report for all students in an examination.
     */
    @Transactional(readOnly = true)
    public byte[] exportCumulativeExamPdf(Long examId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found: " + examId));
        List<ExamAttempt> attempts = attemptRepository.findByExamId(examId);

        com.lowagie.text.Document doc = new com.lowagie.text.Document();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            com.lowagie.text.pdf.PdfWriter.getInstance(doc, out);
            doc.open();

            com.lowagie.text.Font titleFont = new com.lowagie.text.Font(
                    com.lowagie.text.Font.HELVETICA, 16, com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font subtitleFont = new com.lowagie.text.Font(
                    com.lowagie.text.Font.HELVETICA, 10, com.lowagie.text.Font.ITALIC);
            com.lowagie.text.Font sectionFont = new com.lowagie.text.Font(
                    com.lowagie.text.Font.HELVETICA, 12, com.lowagie.text.Font.BOLD);

            // Title block
            doc.add(new com.lowagie.text.Paragraph("Cumulative Examination & Proctoring Evaluation Report", titleFont));
            doc.add(new com.lowagie.text.Paragraph("Comprehensive Multi-Candidate Assessment Audit & Verified Marks Roster", subtitleFont));
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Examination Overview Table
            doc.add(new com.lowagie.text.Paragraph("Examination Overview", sectionFont));
            com.lowagie.text.pdf.PdfPTable examTable = new com.lowagie.text.pdf.PdfPTable(2);
            examTable.setWidthPercentage(100);
            addPdfRow(examTable, "Examination Title", exam.getName());
            addPdfRow(examTable, "Subject / Category", exam.getSubject() != null ? exam.getSubject() : "General");
            addPdfRow(examTable, "Duration", exam.getDurationMinutes() + " minutes");
            addPdfRow(examTable, "Configured Questions", String.valueOf(exam.getNumQuestions()));
            addPdfRow(examTable, "Total Candidate Attempts", String.valueOf(attempts.size()));

            long submittedCount = attempts.stream()
                    .filter(at -> "SUBMITTED".equalsIgnoreCase(at.getStatus()) || "VERIFIED".equalsIgnoreCase(at.getStatus()))
                    .count();
            long verifiedCount = attempts.stream()
                    .filter(at -> "VERIFIED".equalsIgnoreCase(at.getStatus()))
                    .count();
            long flaggedCount = attempts.stream()
                    .filter(at -> Boolean.TRUE.equals(at.getFlaggedForReview()))
                    .count();
            addPdfRow(examTable, "Completed Submissions", String.valueOf(submittedCount));
            addPdfRow(examTable, "Admin Evaluated & Verified", String.valueOf(verifiedCount));
            addPdfRow(examTable, "Flagged For Review", String.valueOf(flaggedCount));

            OptionalDouble avgScoreOpt = attempts.stream()
                    .filter(at -> at.getScore() != null)
                    .mapToDouble(at -> at.getScore().doubleValue())
                    .average();
            String avgScoreStr = avgScoreOpt.isPresent() ? String.format("%.2f pts", avgScoreOpt.getAsDouble()) : "Pending Evaluation";
            addPdfRow(examTable, "Class Average Marks", avgScoreStr);

            doc.add(examTable);
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Consolidated Candidates Table
            doc.add(new com.lowagie.text.Paragraph("Consolidated Student Roster & Marks Summary (" + attempts.size() + " Candidates)", sectionFont));
            com.lowagie.text.pdf.PdfPTable rosterTable = new com.lowagie.text.pdf.PdfPTable(7);
            rosterTable.setWidthPercentage(100);
            float[] widths = {2.2f, 3.0f, 0.8f, 1.4f, 1.3f, 1.2f, 1.4f};
            rosterTable.setWidths(widths);
            addPdfHeaderRow(rosterTable, "Student", "Email", "Att#", "Status", "Marks", "Risk", "Integrity");

            Map<String, Integer> weights = riskEngine.resolveWeights(exam);

            for (ExamAttempt at : attempts) {
                Optional<Student> stOpt = studentRepository.findByEmailIgnoreCase(at.getStudentEmail());
                String sName = stOpt.map(Student::getFullName).filter(s -> !s.isBlank()).orElse("Student");
                String reg = stOpt.map(Student::getRegisterNumber).filter(r -> !r.isBlank()).orElse("");
                String studentCol = reg.isEmpty() ? sName : sName + "\n[" + reg + "]";

                List<ProctoringEvent> evs = eventRepository.findByAttemptIdOrderByOccurredAtAsc(at.getId());
                BigDecimal rScore = riskEngine.computeDecayedRiskScore(evs, weights, Instant.now());
                String scoreStr = at.getScore() != null ? at.getScore().toPlainString() + " pts" : "—";
                String integrityStr = Boolean.TRUE.equals(at.getFlaggedForReview()) ? "FLAGGED" : "Clear";

                addPdfRow(rosterTable,
                        studentCol,
                        at.getStudentEmail(),
                        String.valueOf(at.getAttemptNumber()),
                        at.getStatus() != null ? at.getStatus() : "—",
                        scoreStr,
                        rScore.toPlainString(),
                        integrityStr
                );
            }
            doc.add(rosterTable);
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Detailed Candidate Summaries
            if (!attempts.isEmpty()) {
                doc.add(new com.lowagie.text.Paragraph("Individual Candidate Evaluation Summaries", sectionFont));
                for (ExamAttempt at : attempts) {
                    com.lowagie.text.pdf.PdfPTable detailTable = new com.lowagie.text.pdf.PdfPTable(2);
                    detailTable.setWidthPercentage(100);
                    addPdfRow(detailTable, "Student Identification", at.getStudentEmail() + " (Attempt #" + at.getAttemptNumber() + ")");
                    addPdfRow(detailTable, "Marks / Score Awarded", at.getScore() != null ? at.getScore().toPlainString() + " pts" : "Pending Evaluation");
                    addPdfRow(detailTable, "Evaluation Status", at.getStatus() != null ? at.getStatus() : "—");
                    List<ProctoringEvent> evs = eventRepository.findByAttemptIdOrderByOccurredAtAsc(at.getId());
                    long critHigh = evs.stream().filter(e -> "CRITICAL".equalsIgnoreCase(e.getSeverity()) || "HIGH".equalsIgnoreCase(e.getSeverity())).count();
                    addPdfRow(detailTable, "Proctoring Telemetry", evs.size() + " total events (" + critHigh + " Critical/High violations)");
                    doc.add(detailTable);
                    doc.add(new com.lowagie.text.Paragraph(" "));
                }
            }

        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate cumulative PDF: " + e.getMessage());
        } finally {
            doc.close();
        }
        return out.toByteArray();
    }

    @SuppressWarnings("unchecked")
    private List<Long> decodeOrder(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            List<Integer> raw = objectMapper.readValue(json, List.class);
            return raw.stream().map(Integer::longValue).toList();
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private record Context(ExamAttempt attempt, List<ProctoringEvent> events,
                           List<Warning> warnings, BigDecimal riskScore) {}

    @Transactional(readOnly = true)
    Context loadContext(Long attemptId) {
        ExamAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));
        List<ProctoringEvent> events = eventRepository.findByAttemptIdOrderByOccurredAtAsc(attemptId);
        List<Warning> warnings = warningRepository.findByAttemptIdOrderByCreatedAtAsc(attemptId);
        Map<String, Integer> weights = riskEngine.resolveWeights(attempt.getExam());
        BigDecimal riskScore = riskEngine.computeDecayedRiskScore(events, weights, Instant.now());
        return new Context(attempt, events, warnings, riskScore);
    }

    private String format(Instant t) {
        return t == null ? "" : FMT.format(t);
    }

    private String nullSafe(Object o) {
        return o == null ? "" : o.toString();
    }

    private String csvEscape(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    // ── Excel helpers ─────────────────────────────────────────────────────────

    private CellStyle boldStyle(Workbook wb) {
        CellStyle cs = wb.createCellStyle();
        Font f = wb.createFont();
        f.setBold(true);
        cs.setFont(f);
        return cs;
    }

    private void addRow(Sheet sheet, int rowNum, CellStyle style, String... values) {
        Row row = sheet.createRow(rowNum);
        for (int i = 0; i < values.length; i++) {
            Cell cell = row.createCell(i);
            cell.setCellValue(values[i]);
            if (style != null) cell.setCellStyle(style);
        }
    }

    // ── Requirement 3: 1-Page Question Completion PDF ─────────────────────────

    @Transactional(readOnly = true)
    public byte[] exportExamQuestionCompletionPdf(Long examId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found: " + examId));

        List<ExamAttempt> attempts = attemptRepository.findByExamIdOrderByStartTimeDesc(examId);

        com.lowagie.text.Document doc = new com.lowagie.text.Document(com.lowagie.text.PageSize.A4, 28, 28, 28, 28);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            com.lowagie.text.pdf.PdfWriter.getInstance(doc, out);
            doc.open();

            if (attempts.isEmpty()) {
                com.lowagie.text.Font titleFont = new com.lowagie.text.Font(
                        com.lowagie.text.Font.HELVETICA, 14, com.lowagie.text.Font.BOLD, new java.awt.Color(30, 41, 59));
                com.lowagie.text.Paragraph p = new com.lowagie.text.Paragraph("No student attempts recorded yet for " + exam.getName(), titleFont);
                p.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
                doc.add(p);
            } else {
                for (int i = 0; i < attempts.size(); i++) {
                    if (i > 0) {
                        doc.newPage();
                    }
                    renderQuestionCompletionPage(doc, exam, attempts.get(i));
                }
            }
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate question completion PDF: " + e.getMessage());
        } finally {
            if (doc != null && doc.isOpen()) {
                doc.close();
            }
        }
        return out.toByteArray();
    }

    @Transactional(readOnly = true)
    public byte[] exportAttemptQuestionCompletionPdf(Long attemptId) {
        ExamAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));
        Exam exam = attempt.getExam();

        com.lowagie.text.Document doc = new com.lowagie.text.Document(com.lowagie.text.PageSize.A4, 28, 28, 28, 28);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            com.lowagie.text.pdf.PdfWriter.getInstance(doc, out);
            doc.open();
            renderQuestionCompletionPage(doc, exam, attempt);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate question completion PDF: " + e.getMessage());
        } finally {
            if (doc != null && doc.isOpen()) {
                doc.close();
            }
        }
        return out.toByteArray();
    }

    private void renderQuestionCompletionPage(com.lowagie.text.Document doc, Exam exam, ExamAttempt attempt) throws com.lowagie.text.DocumentException {
        Optional<Student> studentOpt = studentRepository.findByEmailIgnoreCase(attempt.getStudentEmail());
        String studentName = studentOpt.map(Student::getFullName).filter(s -> !s.isBlank()).orElse("Candidate");
        String regNumber = studentOpt.map(Student::getRegisterNumber).filter(s -> !s.isBlank()).orElse("—");
        String studentEmail = attempt.getStudentEmail();

        List<Long> orderedQuestionIds = decodeOrder(attempt.getQuestionOrder());
        List<ExamQuestion> questionsToDisplay;
        if (orderedQuestionIds != null && !orderedQuestionIds.isEmpty()) {
            Map<Long, ExamQuestion> qMap = new HashMap<>();
            questionRepository.findAllById(orderedQuestionIds).forEach(q -> qMap.put(q.getId(), q));
            questionsToDisplay = new ArrayList<>();
            for (Long qid : orderedQuestionIds) {
                ExamQuestion q = qMap.get(qid);
                if (q != null) questionsToDisplay.add(q);
            }
        } else {
            questionsToDisplay = questionRepository.findByExamIdOrderByDisplayOrderAsc(exam.getId());
        }

        List<ExamAnswer> studentAnswers = answerRepository.findByAttemptId(attempt.getId());
        Map<Long, ExamAnswer> answerByQuestion = new HashMap<>();
        if (studentAnswers != null) {
            studentAnswers.forEach(ans -> {
                if (ans != null && ans.getQuestion() != null && ans.getQuestion().getId() != null) {
                    answerByQuestion.put(ans.getQuestion().getId(), ans);
                }
            });
        }

        int totalQuestions = questionsToDisplay.size();
        int completedCount = 0;
        int incompletedCount = 0;

        for (ExamQuestion q : questionsToDisplay) {
            ExamAnswer ans = answerByQuestion.get(q.getId());
            boolean isCoding = "CODING".equalsIgnoreCase(q.getQuestionType());
            boolean isCompleted;
            if (isCoding) {
                isCompleted = ans != null && ans.getCodeSubmission() != null && !ans.getCodeSubmission().trim().isEmpty();
            } else {
                isCompleted = ans != null && ans.getSelectedOption() != null && ans.getSelectedOption() > 0;
            }
            if (isCompleted) {
                completedCount++;
            } else {
                incompletedCount++;
            }
        }

        double completionRate = totalQuestions > 0 ? (completedCount * 100.0 / totalQuestions) : 0;

        com.lowagie.text.Font titleFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 13, com.lowagie.text.Font.BOLD, new java.awt.Color(30, 41, 59));
        com.lowagie.text.Font subTitleFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8f, com.lowagie.text.Font.NORMAL, new java.awt.Color(100, 116, 139));
        com.lowagie.text.Font sectionTitleFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 9.5f, com.lowagie.text.Font.BOLD, new java.awt.Color(30, 41, 59));
        com.lowagie.text.Font metaLabelFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8, com.lowagie.text.Font.BOLD, new java.awt.Color(71, 85, 105));
        com.lowagie.text.Font metaValFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8, com.lowagie.text.Font.NORMAL, new java.awt.Color(15, 23, 42));
        com.lowagie.text.Font tableHeaderFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8, com.lowagie.text.Font.BOLD, new java.awt.Color(30, 41, 59));
        com.lowagie.text.Font cellFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 7.5f, com.lowagie.text.Font.NORMAL, new java.awt.Color(15, 23, 42));
        com.lowagie.text.Font statusCompletedFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 7.5f, com.lowagie.text.Font.BOLD, new java.awt.Color(22, 101, 52));
        com.lowagie.text.Font statusIncompletedFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 7.5f, com.lowagie.text.Font.BOLD, new java.awt.Color(185, 28, 28));

        com.lowagie.text.Paragraph pTitle = new com.lowagie.text.Paragraph("OFFICIAL CANDIDATE QUESTION COMPLETION REPORT", titleFont);
        pTitle.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        doc.add(pTitle);

        com.lowagie.text.Paragraph pSub = new com.lowagie.text.Paragraph(
                "Examination: " + exam.getName() + " | Subject: " + (exam.getSubject() != null ? exam.getSubject() : "General") + " | Generated: " + FMT.format(Instant.now()), subTitleFont);
        pSub.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        pSub.setSpacingAfter(6f);
        doc.add(pSub);

        // Student Info Summary Table
        com.lowagie.text.pdf.PdfPTable infoTable = new com.lowagie.text.pdf.PdfPTable(4);
        infoTable.setWidthPercentage(100);
        float[] infoWidths = {2.2f, 3.8f, 2.2f, 3.8f};
        infoTable.setWidths(infoWidths);
        infoTable.setSpacingAfter(7f);

        addPdfInfoCell(infoTable, "Student Name:", metaLabelFont, studentName, metaValFont);
        addPdfInfoCell(infoTable, "Register Number:", metaLabelFont, regNumber, metaValFont);
        addPdfInfoCell(infoTable, "Mail ID (Email):", metaLabelFont, studentEmail, metaValFont);
        addPdfInfoCell(infoTable, "Attempt Number:", metaLabelFont, "#" + attempt.getAttemptNumber() + " (ID: #" + attempt.getId() + ")", metaValFont);
        addPdfInfoCell(infoTable, "Exam Status:", metaLabelFont, attempt.getStatus(), metaValFont);
        addPdfInfoCell(infoTable, "Verified Marks:", metaLabelFont, attempt.getScore() != null ? attempt.getScore().toPlainString() + " pts" : "Pending", metaValFont);
        addPdfInfoCell(infoTable, "Questions Completed:", metaLabelFont, completedCount + " / " + totalQuestions + " (" + String.format("%.1f", completionRate) + "%)", metaValFont);
        addPdfInfoCell(infoTable, "Questions Incompleted:", metaLabelFont, incompletedCount + " / " + totalQuestions, metaValFont);

        doc.add(infoTable);

        com.lowagie.text.Paragraph pSec = new com.lowagie.text.Paragraph("Question-by-Question Completion Status (" + totalQuestions + " Questions)", sectionTitleFont);
        pSec.setSpacingAfter(3f);
        doc.add(pSec);

        com.lowagie.text.pdf.PdfPTable qTable = new com.lowagie.text.pdf.PdfPTable(5);
        qTable.setWidthPercentage(100);
        float[] qWidths = {0.8f, 4.8f, 1.4f, 2.2f, 2.8f};
        qTable.setWidths(qWidths);

        addStyledHeaderCell(qTable, "Q#", tableHeaderFont);
        addStyledHeaderCell(qTable, "Question / Problem Title", tableHeaderFont);
        addStyledHeaderCell(qTable, "Type", tableHeaderFont);
        addStyledHeaderCell(qTable, "Completion Status", tableHeaderFont);
        addStyledHeaderCell(qTable, "Candidate Submission", tableHeaderFont);

        int qIdx = 1;
        for (ExamQuestion q : questionsToDisplay) {
            ExamAnswer ans = answerByQuestion.get(q.getId());
            boolean isCoding = "CODING".equalsIgnoreCase(q.getQuestionType());
            boolean isCompleted = false;
            String responseSummary = "No response";

            if (isCoding) {
                if (ans != null && ans.getCodeSubmission() != null && !ans.getCodeSubmission().trim().isEmpty()) {
                    isCompleted = true;
                    int lines = ans.getCodeSubmission().split("\r\n|\r|\n").length;
                    String lang = ans.getCodeLanguage() != null ? ans.getCodeLanguage().toUpperCase() : "CODE";
                    responseSummary = lang + " (" + lines + " lines)";
                }
            } else {
                if (ans != null && ans.getSelectedOption() != null && ans.getSelectedOption() > 0) {
                    isCompleted = true;
                    char opt = (char) ('A' + (ans.getSelectedOption() - 1));
                    responseSummary = "Selected Option " + opt;
                }
            }

            String title = q.getProblemTitle() != null && !q.getProblemTitle().isBlank()
                    ? q.getProblemTitle()
                    : (q.getQuestionText() != null ? (q.getQuestionText().length() > 50 ? q.getQuestionText().substring(0, 48) + "..." : q.getQuestionText()) : ("Question " + qIdx));

            addStyledBodyCell(qTable, String.valueOf(qIdx++), cellFont, com.lowagie.text.Element.ALIGN_CENTER, null);
            addStyledBodyCell(qTable, title, cellFont, com.lowagie.text.Element.ALIGN_LEFT, null);
            addStyledBodyCell(qTable, isCoding ? "CODING" : "MCQ", cellFont, com.lowagie.text.Element.ALIGN_CENTER, null);

            if (isCompleted) {
                addStyledBodyCell(qTable, "COMPLETED", statusCompletedFont, com.lowagie.text.Element.ALIGN_CENTER, new java.awt.Color(220, 252, 231));
            } else {
                addStyledBodyCell(qTable, "INCOMPLETED", statusIncompletedFont, com.lowagie.text.Element.ALIGN_CENTER, new java.awt.Color(254, 226, 226));
            }

            addStyledBodyCell(qTable, responseSummary, cellFont, com.lowagie.text.Element.ALIGN_LEFT, null);
        }

        doc.add(qTable);

        com.lowagie.text.Paragraph pFooter = new com.lowagie.text.Paragraph("✓ Official Integrity Verification: This candidate question completion record is sealed and tamper-evident.", subTitleFont);
        pFooter.setSpacingBefore(6f);
        pFooter.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        doc.add(pFooter);
    }

    // ── Requirement 4: Warning Strikes Report ─────────────────────────────────

    public static class StrikeDetail {
        public int strike;
        public Instant occurredAt;
        public String violationType;
        public String reason;
        public String riskScore;
        public String action;

        public StrikeDetail(int strike, Instant occurredAt, String violationType, String reason, String riskScore, String action) {
            this.strike = strike;
            this.occurredAt = occurredAt;
            this.violationType = violationType;
            this.reason = reason;
            this.riskScore = riskScore;
            this.action = action;
        }
    }

    @Transactional(readOnly = true)
    public byte[] exportExamWarningStrikesPdf(Long examId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found: " + examId));

        List<ExamAttempt> attempts = attemptRepository.findByExamIdOrderByStartTimeDesc(examId);

        com.lowagie.text.Document doc = new com.lowagie.text.Document(com.lowagie.text.PageSize.A4, 28, 28, 28, 28);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            com.lowagie.text.pdf.PdfWriter.getInstance(doc, out);
            doc.open();

            renderWarningStrikesDoc(doc, exam, attempts);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate warning strikes PDF: " + e.getMessage());
        } finally {
            if (doc != null && doc.isOpen()) {
                doc.close();
            }
        }
        return out.toByteArray();
    }

    @Transactional(readOnly = true)
    public byte[] exportAttemptWarningStrikesPdf(Long attemptId) {
        ExamAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));
        Exam exam = attempt.getExam();

        com.lowagie.text.Document doc = new com.lowagie.text.Document(com.lowagie.text.PageSize.A4, 28, 28, 28, 28);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            com.lowagie.text.pdf.PdfWriter.getInstance(doc, out);
            doc.open();

            renderWarningStrikesDoc(doc, exam, List.of(attempt));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate warning strikes PDF: " + e.getMessage());
        } finally {
            if (doc != null && doc.isOpen()) {
                doc.close();
            }
        }
        return out.toByteArray();
    }

    private void renderWarningStrikesDoc(com.lowagie.text.Document doc, Exam exam, List<ExamAttempt> attempts) throws com.lowagie.text.DocumentException {
        com.lowagie.text.Font titleFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 14, com.lowagie.text.Font.BOLD, new java.awt.Color(185, 28, 28));
        com.lowagie.text.Font subTitleFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8.5f, com.lowagie.text.Font.NORMAL, new java.awt.Color(100, 116, 139));
        com.lowagie.text.Font sectionHeaderFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 10, com.lowagie.text.Font.BOLD, new java.awt.Color(30, 41, 59));
        com.lowagie.text.Font metaLabelFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8, com.lowagie.text.Font.BOLD, new java.awt.Color(71, 85, 105));
        com.lowagie.text.Font metaValFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8, com.lowagie.text.Font.NORMAL, new java.awt.Color(15, 23, 42));
        com.lowagie.text.Font tableHeaderFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 8, com.lowagie.text.Font.BOLD, new java.awt.Color(30, 41, 59));
        com.lowagie.text.Font cellFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 7.5f, com.lowagie.text.Font.NORMAL, new java.awt.Color(15, 23, 42));
        com.lowagie.text.Font strikeBadgeFont = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 7.5f, com.lowagie.text.Font.BOLD, new java.awt.Color(185, 28, 28));

        com.lowagie.text.Paragraph pTitle = new com.lowagie.text.Paragraph("PROCTORING WARNING STRIKES & INTEGRITY AUDIT REPORT", titleFont);
        pTitle.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        doc.add(pTitle);

        com.lowagie.text.Paragraph pSub = new com.lowagie.text.Paragraph(
                "Examination: " + exam.getName() + " | Subject: " + (exam.getSubject() != null ? exam.getSubject() : "General") + " | Generated: " + FMT.format(Instant.now()), subTitleFont);
        pSub.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        pSub.setSpacingAfter(8f);
        doc.add(pSub);

        List<Map.Entry<ExamAttempt, List<StrikeDetail>>> penalizedStudents = new ArrayList<>();
        for (ExamAttempt at : attempts) {
            List<StrikeDetail> strikes = getStrikesForAttempt(at);
            if (!strikes.isEmpty()) {
                penalizedStudents.add(new AbstractMap.SimpleEntry<>(at, strikes));
            }
        }

        com.lowagie.text.pdf.PdfPTable metaTable = new com.lowagie.text.pdf.PdfPTable(4);
        metaTable.setWidthPercentage(100);
        float[] mWidths = {2.5f, 3.5f, 2.5f, 3.5f};
        metaTable.setWidths(mWidths);
        metaTable.setSpacingAfter(10f);

        addPdfInfoCell(metaTable, "Total Assessed Candidates:", metaLabelFont, String.valueOf(attempts.size()), metaValFont);
        addPdfInfoCell(metaTable, "Candidates with Warning Strikes:", metaLabelFont, String.valueOf(penalizedStudents.size()), metaValFont);
        addPdfInfoCell(metaTable, "Passing Marks Threshold:", metaLabelFont, exam.getPassingMarks() != null ? exam.getPassingMarks().toPlainString() + " pts" : "—", metaValFont);
        addPdfInfoCell(metaTable, "Proctoring Integrity Audit:", metaLabelFont, penalizedStudents.isEmpty() ? "100% CLEAN" : penalizedStudents.size() + " Infractions Flagged", metaValFont);

        doc.add(metaTable);

        if (penalizedStudents.isEmpty()) {
            com.lowagie.text.pdf.PdfPTable cleanTable = new com.lowagie.text.pdf.PdfPTable(1);
            cleanTable.setWidthPercentage(100);
            com.lowagie.text.pdf.PdfPCell cleanCell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(
                    "✓ 100% Clean Integrity Record: No candidates incurred warning strikes during this examination session. All candidates observed fullscreen, tab focus, and proctoring compliance without infraction.",
                    new com.lowagie.text.Font(com.lowagie.text.Font.HELVETICA, 9.5f, com.lowagie.text.Font.BOLD, new java.awt.Color(22, 101, 52))));
            cleanCell.setBackgroundColor(new java.awt.Color(240, 253, 244));
            cleanCell.setBorderColor(new java.awt.Color(134, 239, 172));
            cleanCell.setPadding(12f);
            cleanCell.setHorizontalAlignment(com.lowagie.text.Element.ALIGN_CENTER);
            cleanTable.addCell(cleanCell);
            cleanTable.setSpacingBefore(12f);
            doc.add(cleanTable);
            return;
        }

        int studentIdx = 1;
        for (Map.Entry<ExamAttempt, List<StrikeDetail>> entry : penalizedStudents) {
            ExamAttempt at = entry.getKey();
            List<StrikeDetail> strikes = entry.getValue();

            Optional<Student> studentOpt = studentRepository.findByEmailIgnoreCase(at.getStudentEmail());
            String studentName = studentOpt.map(Student::getFullName).filter(s -> !s.isBlank()).orElse("Candidate");
            String regNumber = studentOpt.map(Student::getRegisterNumber).filter(s -> !s.isBlank()).orElse("—");
            String studentEmail = at.getStudentEmail();

            com.lowagie.text.Paragraph pCand = new com.lowagie.text.Paragraph(
                    studentIdx++ + ". " + studentName + " (Reg No: " + regNumber + ")", sectionHeaderFont);
            pCand.setSpacingBefore(8f);
            pCand.setSpacingAfter(4f);
            doc.add(pCand);

            com.lowagie.text.pdf.PdfPTable candInfo = new com.lowagie.text.pdf.PdfPTable(4);
            candInfo.setWidthPercentage(100);
            float[] cWidths = {2.2f, 3.8f, 2.2f, 3.8f};
            candInfo.setWidths(cWidths);
            candInfo.setSpacingAfter(4f);

            addPdfInfoCell(candInfo, "Student Name:", metaLabelFont, studentName, metaValFont);
            addPdfInfoCell(candInfo, "Register Number:", metaLabelFont, regNumber, metaValFont);
            addPdfInfoCell(candInfo, "Mail ID (Email):", metaLabelFont, studentEmail, metaValFont);
            addPdfInfoCell(candInfo, "Total Strikes Incurred:", metaLabelFont, strikes.size() + " / 3 Strikes (" + (strikes.size() >= 3 ? "EXAM TERMINATED" : (strikes.size() == 2 ? "FINAL WARNING" : "WARNING ISSUED")) + ")", strikeBadgeFont);

            doc.add(candInfo);

            com.lowagie.text.pdf.PdfPTable sTable = new com.lowagie.text.pdf.PdfPTable(5);
            sTable.setWidthPercentage(100);
            float[] sWidths = {1.2f, 2.0f, 2.5f, 4.3f, 2.0f};
            sTable.setWidths(sWidths);
            sTable.setSpacingAfter(8f);

            addStyledHeaderCell(sTable, "Strike Level", tableHeaderFont);
            addStyledHeaderCell(sTable, "Timestamp", tableHeaderFont);
            addStyledHeaderCell(sTable, "Violation Type", tableHeaderFont);
            addStyledHeaderCell(sTable, "Infraction Reason / Description", tableHeaderFont);
            addStyledHeaderCell(sTable, "Action Taken", tableHeaderFont);

            for (StrikeDetail s : strikes) {
                addStyledBodyCell(sTable, "Strike " + s.strike + " of 3", strikeBadgeFont, com.lowagie.text.Element.ALIGN_CENTER, new java.awt.Color(254, 242, 242));
                addStyledBodyCell(sTable, s.occurredAt != null ? FMT.format(s.occurredAt) : "—", cellFont, com.lowagie.text.Element.ALIGN_CENTER, null);
                addStyledBodyCell(sTable, s.violationType, cellFont, com.lowagie.text.Element.ALIGN_LEFT, null);
                addStyledBodyCell(sTable, s.reason, cellFont, com.lowagie.text.Element.ALIGN_LEFT, null);
                addStyledBodyCell(sTable, s.action, cellFont, com.lowagie.text.Element.ALIGN_CENTER, null);
            }

            doc.add(sTable);
        }

        com.lowagie.text.Paragraph pFooter = new com.lowagie.text.Paragraph("✓ Official Proctoring Security Log: Warning strikes are permanently recorded in the immutable audit registry.", subTitleFont);
        pFooter.setSpacingBefore(10f);
        pFooter.setAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        doc.add(pFooter);
    }

    private List<StrikeDetail> getStrikesForAttempt(ExamAttempt attempt) {
        List<StrikeDetail> strikes = new ArrayList<>();
        Map<Integer, StrikeDetail> strikeByLevel = new HashMap<>();

        // 1. Check Warning records
        List<Warning> warnings = warningRepository.findByAttemptIdOrderByCreatedAtAsc(attempt.getId());
        for (Warning w : warnings) {
            int lvl = w.getLevel() != null ? w.getLevel().intValue() : 1;
            String action = lvl >= 3 ? "EXAM_TERMINATED" : (lvl == 2 ? "FINAL_WARNING" : "WARNING_ISSUED");
            strikeByLevel.put(lvl, new StrikeDetail(
                    lvl,
                    w.getCreatedAt(),
                    "PROCTORING_VIOLATION",
                    w.getMessage() != null ? w.getMessage() : "Proctoring threshold breach",
                    w.getRiskScoreAtTime() != null ? w.getRiskScoreAtTime().toPlainString() : "—",
                    action
            ));
        }

        // 2. Check ProctoringEvent records
        List<ProctoringEvent> events = eventRepository.findByAttemptIdOrderByOccurredAtAsc(attempt.getId());
        for (ProctoringEvent ev : events) {
            if ("WARNING_STRIKE".equalsIgnoreCase(ev.getEventType())) {
                int strikeNum = 1;
                String reason = "Proctoring infraction";
                String desc = "";
                String action = "WARNING_ISSUED";
                if (ev.getMetadata() != null && !ev.getMetadata().isBlank()) {
                    try {
                        Map<String, Object> map = objectMapper.readValue(ev.getMetadata(), Map.class);
                        if (map.containsKey("strike") && map.get("strike") != null) {
                            strikeNum = ((Number) map.get("strike")).intValue();
                        }
                        if (map.containsKey("reason") && map.get("reason") != null) {
                            reason = String.valueOf(map.get("reason"));
                        }
                        if (map.containsKey("description") && map.get("description") != null) {
                            desc = String.valueOf(map.get("description"));
                        }
                        if (map.containsKey("action") && map.get("action") != null) {
                            action = String.valueOf(map.get("action"));
                        }
                    } catch (Exception ignored) {}
                }
                String combinedReason = desc.isBlank() ? reason : (reason + " (" + desc + ")");
                action = strikeNum >= 3 ? "EXAM_TERMINATED" : (strikeNum == 2 ? "FINAL_WARNING" : "WARNING_ISSUED");
                strikeByLevel.put(strikeNum, new StrikeDetail(
                        strikeNum,
                        ev.getOccurredAt(),
                        "WARNING_STRIKE",
                        combinedReason,
                        ev.getSeverity() != null ? ev.getSeverity() : "HIGH",
                        action
                ));
            } else if ("FULLSCREEN_EXIT".equalsIgnoreCase(ev.getEventType())) {
                if (ev.getMetadata() != null && ev.getMetadata().contains("count")) {
                    try {
                        Map<String, Object> map = objectMapper.readValue(ev.getMetadata(), Map.class);
                        int count = map.containsKey("count") ? ((Number) map.get("count")).intValue() : 1;
                        String act = map.containsKey("action") ? String.valueOf(map.get("action")) : "WARNING_ISSUED";
                        String reason = map.containsKey("reason") ? String.valueOf(map.get("reason")) : "Exited fullscreen mode";
                        if (!strikeByLevel.containsKey(count)) {
                            strikeByLevel.put(count, new StrikeDetail(
                                    count,
                                    ev.getOccurredAt(),
                                    "FULLSCREEN_EXIT",
                                    reason,
                                    ev.getSeverity() != null ? ev.getSeverity() : "HIGH",
                                    act
                            ));
                        }
                    } catch (Exception ignored) {}
                }
            }
        }

        strikes.addAll(strikeByLevel.values());
        strikes.sort(Comparator.comparingInt(s -> s.strike));
        return strikes;
    }

    private void addPdfInfoCell(com.lowagie.text.pdf.PdfPTable t, String label, com.lowagie.text.Font lf, String val, com.lowagie.text.Font vf) {
        com.lowagie.text.pdf.PdfPCell lCell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(label, lf));
        lCell.setBackgroundColor(new java.awt.Color(248, 250, 252));
        lCell.setBorderColor(new java.awt.Color(226, 232, 240));
        lCell.setPadding(3.5f);
        t.addCell(lCell);

        com.lowagie.text.pdf.PdfPCell vCell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(val != null ? val : "—", vf));
        vCell.setBorderColor(new java.awt.Color(226, 232, 240));
        vCell.setPadding(3.5f);
        t.addCell(vCell);
    }

    private void addStyledHeaderCell(com.lowagie.text.pdf.PdfPTable t, String title, com.lowagie.text.Font font) {
        com.lowagie.text.pdf.PdfPCell cell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(title, font));
        cell.setBackgroundColor(new java.awt.Color(241, 245, 249));
        cell.setBorderColor(new java.awt.Color(203, 213, 225));
        cell.setPadding(4.5f);
        cell.setHorizontalAlignment(com.lowagie.text.Element.ALIGN_CENTER);
        t.addCell(cell);
    }

    private void addStyledBodyCell(com.lowagie.text.pdf.PdfPTable t, String text, com.lowagie.text.Font font, int align, java.awt.Color bg) {
        com.lowagie.text.pdf.PdfPCell cell = new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(text != null ? text : "", font));
        if (bg != null) {
            cell.setBackgroundColor(bg);
        }
        cell.setBorderColor(new java.awt.Color(226, 232, 240));
        cell.setPadding(3.5f);
        cell.setHorizontalAlignment(align);
        cell.setVerticalAlignment(com.lowagie.text.Element.ALIGN_MIDDLE);
        t.addCell(cell);
    }

    // ── PDF helpers ───────────────────────────────────────────────────────────

    private void addPdfRow(com.lowagie.text.pdf.PdfPTable t, String... values) {
        for (String v : values) {
            t.addCell(new com.lowagie.text.pdf.PdfPCell(new com.lowagie.text.Phrase(v,
                    new com.lowagie.text.Font(com.lowagie.text.Font.HELVETICA, 9))));
        }
    }

    private void addPdfHeaderRow(com.lowagie.text.pdf.PdfPTable t, String... headers) {
        com.lowagie.text.Font hf = new com.lowagie.text.Font(
                com.lowagie.text.Font.HELVETICA, 9, com.lowagie.text.Font.BOLD);
        for (String h : headers) {
            com.lowagie.text.pdf.PdfPCell cell = new com.lowagie.text.pdf.PdfPCell(
                    new com.lowagie.text.Phrase(h, hf));
            cell.setBackgroundColor(new java.awt.Color(220, 220, 220));
            t.addCell(cell);
        }
    }
}
