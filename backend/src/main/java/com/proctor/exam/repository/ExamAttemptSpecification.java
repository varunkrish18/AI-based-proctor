package com.proctor.exam.repository;

import com.proctor.exam.entity.ExamAttempt;
import com.proctor.exam.entity.ProctoringEvent;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class ExamAttemptSpecification {

    public static Specification<ExamAttempt> filter(
            Long examId,
            String studentEmail,
            String severity,
            String eventType,
            Instant from,
            Instant to
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (examId != null) {
                predicates.add(cb.equal(root.get("exam").get("id"), examId));
            }

            if (studentEmail != null && !studentEmail.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("studentEmail")), "%" + studentEmail.trim().toLowerCase() + "%"));
            }

            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startTime"), from));
            }

            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startTime"), to));
            }

            if (severity != null && !severity.isBlank()) {
                Subquery<Long> subquery = query.subquery(Long.class);
                var subRoot = subquery.from(ProctoringEvent.class);
                subquery.select(cb.literal(1L))
                        .where(
                                cb.equal(subRoot.get("attempt"), root),
                                cb.equal(cb.upper(subRoot.get("severity")), severity.trim().toUpperCase())
                        );
                predicates.add(cb.exists(subquery));
            }

            if (eventType != null && !eventType.isBlank()) {
                Subquery<Long> subquery = query.subquery(Long.class);
                var subRoot = subquery.from(ProctoringEvent.class);
                subquery.select(cb.literal(1L))
                        .where(
                                cb.equal(subRoot.get("attempt"), root),
                                cb.equal(cb.upper(subRoot.get("eventType")), eventType.trim().toUpperCase())
                        );
                predicates.add(cb.exists(subquery));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
