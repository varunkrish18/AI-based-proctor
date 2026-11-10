package com.proctor.exam.controller;

import com.proctor.exam.dto.AdminLoginRequest;
import com.proctor.exam.dto.AuthResponse;
import com.proctor.exam.dto.TokenRefreshRequest;
import com.proctor.exam.service.AdminAuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private final AdminAuthService adminAuthService;

    public AdminAuthController(AdminAuthService adminAuthService) {
        this.adminAuthService = adminAuthService;
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody AdminLoginRequest request) {
        return adminAuthService.login(request);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody TokenRefreshRequest request) {
        return adminAuthService.refresh(request.refreshToken());
    }

    @PostMapping("/logout")
    public void logout(@RequestBody(required = false) TokenRefreshRequest request) {
        if (request != null && request.refreshToken() != null) {
            adminAuthService.logout(request.refreshToken());
        }
    }
}
