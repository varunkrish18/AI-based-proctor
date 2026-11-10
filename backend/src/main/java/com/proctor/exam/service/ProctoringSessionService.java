package com.proctor.exam.service;

import com.proctor.exam.dto.HeartbeatRequest;
import com.proctor.exam.dto.ProctoringSessionResponse;
import com.proctor.exam.entity.Exam;
import com.proctor.exam.entity.ExamAttempt;
import com.proctor.exam.entity.ProctoringSession;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.ExamAttemptRepository;
import com.proctor.exam.repository.ProctoringSessionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
public class ProctoringSessionService {

    private final ProctoringSessionRepository sessionRepository;
    private final ExamAttemptRepository attemptRepository;

    public ProctoringSessionService(ProctoringSessionRepository sessionRepository,
                                    ExamAttemptRepository attemptRepository) {
        this.sessionRepository = sessionRepository;
        this.attemptRepository = attemptRepository;
    }

    @Transactional
    public ProctoringSession openSession(Long attemptId) {
        Optional<ProctoringSession> existing = sessionRepository.findByAttemptId(attemptId);
        if (existing.isPresent()) {
            return existing.get();
        }

        ExamAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found: " + attemptId));

        Exam exam = attempt.getExam();
        ProctoringSession session = ProctoringSession.builder()
                .attempt(attempt)
                .webcamRequired(exam.getWebcamRequired() == null || exam.getWebcamRequired())
                .microphoneRequired(exam.getMicrophoneRequired() == null || exam.getMicrophoneRequired())
                .screenRequired(exam.getScreenRequired() == null || exam.getScreenRequired())
                .locationRequired(Boolean.TRUE.equals(exam.getLocationRequired()))
                .webcamStatus("UNKNOWN")
                .microphoneStatus("UNKNOWN")
                .screenStatus("UNKNOWN")
                .connectionStatus("ONLINE")
                .startedAt(Instant.now())
                .lastHeartbeatAt(Instant.now())
                .build();

        return sessionRepository.save(session);
    }

    @Transactional
    public ProctoringSessionResponse heartbeat(Long attemptId, String studentEmail, HeartbeatRequest req) {
        ExamAttempt attempt = attemptRepository.findByIdAndStudentEmailIgnoreCase(attemptId, studentEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));

        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot send heartbeat for completed attempt.");
        }

        ProctoringSession session = sessionRepository.findByAttemptId(attemptId)
                .orElseGet(() -> openSession(attemptId));

        if (req != null) {
            if (req.webcamStatus() != null && !req.webcamStatus().isBlank()) {
                session.setWebcamStatus(req.webcamStatus());
            }
            if (req.microphoneStatus() != null && !req.microphoneStatus().isBlank()) {
                session.setMicrophoneStatus(req.microphoneStatus());
            }
            if (req.screenStatus() != null && !req.screenStatus().isBlank()) {
                session.setScreenStatus(req.screenStatus());
            }
            if (req.connectionStatus() != null && !req.connectionStatus().isBlank()) {
                session.setConnectionStatus(req.connectionStatus());
            } else if ("UNKNOWN".equals(session.getConnectionStatus())) {
                session.setConnectionStatus("ONLINE");
            }
        }
        session.setLastHeartbeatAt(Instant.now());
        ProctoringSession saved = sessionRepository.save(session);
        return toResponse(saved);
    }

    @Transactional
    public void closeSession(Long attemptId) {
        sessionRepository.findByAttemptId(attemptId).ifPresent(session -> {
            if (session.getEndedAt() == null) {
                session.setEndedAt(Instant.now());
                sessionRepository.save(session);
            }
        });
    }

    @Transactional(readOnly = true)
    public ProctoringSessionResponse getSessionForAdmin(Long examId, Long attemptId) {
        ExamAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attempt not found."));

        if (!attempt.getExam().getId().equals(examId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Attempt does not belong to specified exam.");
        }

        ProctoringSession session = sessionRepository.findByAttemptId(attemptId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Proctoring session not found for attempt."));

        return toResponse(session);
    }

    @Transactional(readOnly = true)
    public Optional<ProctoringSessionResponse> findSessionResponse(Long attemptId) {
        return sessionRepository.findByAttemptId(attemptId).map(this::toResponse);
    }

    public ProctoringSessionResponse toResponse(ProctoringSession s) {
        return new ProctoringSessionResponse(
                s.getId(),
                s.getAttempt().getId(),
                s.getWebcamRequired(),
                s.getMicrophoneRequired(),
                s.getScreenRequired(),
                s.getLocationRequired(),
                s.getWebcamStatus(),
                s.getMicrophoneStatus(),
                s.getScreenStatus(),
                s.getConnectionStatus(),
                s.getStartedAt(),
                s.getLastHeartbeatAt(),
                s.getEndedAt()
        );
    }
}
