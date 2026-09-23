package com.proctor.exam.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class RootController {

    @GetMapping("/")
    public Map<String, Object> index() {
        return Map.of(
            "status", "UP",
            "service", "AI Proctoring System API",
            "message", "Backend is running and accessible via Cloudflare Tunnel!",
            "publicExamsEndpoint", "/api/exams/public"
        );
    }
}
