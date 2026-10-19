package com.proctor.exam.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "students")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Student {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "register_number")
    private String registerNumber;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "year", length = 50)
    private String year;

    @Column(name = "display_password", length = 100)
    private String displayPassword;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "must_reset_password", nullable = false)
    @Builder.Default
    private Boolean mustResetPassword = true;
}
