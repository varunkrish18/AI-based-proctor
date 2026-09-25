package com.proctor.exam;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ExamBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(ExamBackendApplication.class, args);
    }
}
