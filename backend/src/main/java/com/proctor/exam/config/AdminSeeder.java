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
                    .role("ADMIN")
                    .build();
            adminRepository.save(admin);
            System.out.println("Default admin created: admin@proctor.com / admin123");
        }

        adminRepository.findByEmail("admin@example.com").ifPresent(admin -> {
            admin.setPasswordHash(passwordEncoder.encode("admin123"));
            admin.setFailedAttempts(0);
            admin.setLockedUntil(null);
            adminRepository.save(admin);
            System.out.println("admin@example.com password set to: admin123");
        });
    }
}
