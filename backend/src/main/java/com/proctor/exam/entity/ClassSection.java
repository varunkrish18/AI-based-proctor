package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Entity
@Table(name = "class_sections")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassSection {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "class_name", length = 120, nullable = false)
    private String className;

    @Column(length = 255)
    private String department;

    @Column(length = 64)
    private String year;

    @Column(name = "start_reg", length = 64)
    private String startReg;

    @Column(name = "end_reg", length = 64)
    private String endReg;

    @Column(name = "display_order")
    private Integer displayOrder;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}

