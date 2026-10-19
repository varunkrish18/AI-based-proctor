package com.proctor.exam.controller;

import com.proctor.exam.dto.ResetPasswordRequest;
import com.proctor.exam.dto.UnifiedAuthResponse;
import com.proctor.exam.dto.UnifiedLoginRequest;
import com.proctor.exam.service.UnifiedAuthService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class UnifiedAuthController {

    private final UnifiedAuthService unifiedAuthService;

    public UnifiedAuthController(UnifiedAuthService unifiedAuthService) {
        this.unifiedAuthService = unifiedAuthService;
    }

    @PostMapping("/login")
    public UnifiedAuthResponse login(@Valid @RequestBody UnifiedLoginRequest request) {
        return unifiedAuthService.login(request);
    }

    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(@Valid @RequestBody ResetPasswordRequest request, Authentication auth) {
        return unifiedAuthService.resetPassword(request, auth != null ? auth.getName() : null);
    }

    @GetMapping("/me")
    public Map<String, Object> getCurrentUser(Authentication auth) {
        return unifiedAuthService.getCurrentUser(auth != null ? auth.getName() : null);
    }
}
