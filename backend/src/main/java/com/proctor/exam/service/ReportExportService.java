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

            String studentName = studentRepository.findByEmailIgnoreCase(ctx.attempt.getStudentEmail())
                    .map(com.proctor.exam.entity.Student::getFullName)
                    .orElse("Candidate");

            // Title
            doc.add(new com.lowagie.text.Paragraph("Official Student Examination & Evaluation Report", titleFont));
            doc.add(new com.lowagie.text.Paragraph("Verified Assessment File", bodyFont));
            doc.add(com.lowagie.text.Chunk.NEWLINE);

            // Summary table
            doc.add(new com.lowagie.text.Paragraph("Student & Evaluation Information", sectionFont));
            com.lowagie.text.pdf.PdfPTable summaryTable = new com.lowagie.text.pdf.PdfPTable(2);
            summaryTable.setWidthPercentage(100);
            addPdfRow(summaryTable, "Student Name", studentName);
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
                    q.getQuestionText(),
                    q.getOptionA(),
                    q.getOptionB(),
                    q.getOptionC(),
                    q.getOptionD(),
                    selected,
                    q.getCorrectAnswer(),
                    isCorrect,
                    awarded,
                    q.getMarks() != null ? q.getMarks() : BigDecimal.valueOf(1.0)
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
                String sName = studentRepository.findByEmailIgnoreCase(at.getStudentEmail())
                        .map(Student::getFullName)
                        .orElse("Student");
                List<ProctoringEvent> evs = eventRepository.findByAttemptIdOrderByOccurredAtAsc(at.getId());
                BigDecimal rScore = riskEngine.computeDecayedRiskScore(evs, weights, Instant.now());
                String scoreStr = at.getScore() != null ? at.getScore().toPlainString() + " pts" : "—";
                String integrityStr = Boolean.TRUE.equals(at.getFlaggedForReview()) ? "FLAGGED" : "Clear";

                addPdfRow(rosterTable,
                        sName,
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
