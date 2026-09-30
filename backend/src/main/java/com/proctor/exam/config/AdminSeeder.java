package com.proctor.exam.config;

import com.proctor.exam.entity.Admin;
import com.proctor.exam.repository.AdminRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminSeeder implements CommandLineRunner {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminSeeder(AdminRepository adminRepository, PasswordEncoder passwordEncoder) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (adminRepository.findByEmail("admin@proctor.com").isEmpty()) {
            Admin admin = Admin.builder()
                    .email("admin@proctor.com")
                    .fullName("Default Administrator")
                    .passwordHash(passwordEncoder.encode("admin123"))
                    .displayPassword("admin123")
                    .role("ADMIN")
                    .build();
            adminRepository.save(admin);
            System.out.println("Default admin created: admin@proctor.com / admin123");
        } else {
            adminRepository.findByEmail("admin@proctor.com").ifPresent(admin -> {
                if (admin.getDisplayPassword() == null || admin.getDisplayPassword().isBlank()) {
                    admin.setDisplayPassword("admin123");
                    adminRepository.save(admin);
                }
            });
        }

        if (adminRepository.findByEmail("proctor@proctor.com").isEmpty()) {
            Admin proctor = Admin.builder()
                    .email("proctor@proctor.com")
                    .fullName("Exam Proctor")
                    .passwordHash(passwordEncoder.encode("proctor123"))
                    .displayPassword("proctor123")
                    .role("ADMIN")
                    .build();
            adminRepository.save(proctor);
            System.out.println("Second user created: proctor@proctor.com / proctor123");
        } else {
            adminRepository.findByEmail("proctor@proctor.com").ifPresent(proctor -> {
                if (proctor.getDisplayPassword() == null || proctor.getDisplayPassword().isBlank()) {
                    proctor.setDisplayPassword("proctor123");
                    adminRepository.save(proctor);
                }
            });
        }

        adminRepository.findByEmail("admin@example.com").ifPresent(admin -> {
            admin.setPasswordHash(passwordEncoder.encode("admin123"));
            admin.setDisplayPassword("admin123");
            admin.setFailedAttempts(0);
            admin.setLockedUntil(null);
            adminRepository.save(admin);
            System.out.println("admin@example.com password set to: admin123");
        });
    }
}
