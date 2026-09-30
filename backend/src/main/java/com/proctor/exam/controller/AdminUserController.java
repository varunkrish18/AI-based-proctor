package com.proctor.exam.controller;

import com.proctor.exam.dto.AdminUserResponse;
import com.proctor.exam.dto.CreateAdminUserRequest;
import com.proctor.exam.dto.UpdateAdminUserRequest;
import com.proctor.exam.service.AdminUserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    public List<AdminUserResponse> listUsers() {
        return adminUserService.listUsers();
    }

    @GetMapping("/{id}")
    public AdminUserResponse getUser(@PathVariable Long id) {
        return adminUserService.getUserById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse createUser(@Valid @RequestBody CreateAdminUserRequest request,
                                        Authentication auth) {
        return adminUserService.createUser(request, auth.getName());
    }

    @PutMapping("/{id}")
    public AdminUserResponse updateUser(@PathVariable Long id,
                                        @Valid @RequestBody UpdateAdminUserRequest request,
                                        Authentication auth) {
        return adminUserService.updateUser(id, request, auth.getName());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable Long id, Authentication auth) {
        adminUserService.deleteUser(id, auth.getName());
    }
}
