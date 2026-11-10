package com.proctor.exam.controller;

import com.proctor.exam.dto.BulkProfessorUploadResult;
import com.proctor.exam.dto.CreateProfessorRequest;
import com.proctor.exam.dto.ProfessorUserResponse;
import com.proctor.exam.dto.UpdateProfessorRequest;
import com.proctor.exam.service.ProfessorAdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/admin/professors")
public class AdminProfessorController {

    private final ProfessorAdminService professorAdminService;

    public AdminProfessorController(ProfessorAdminService professorAdminService) {
        this.professorAdminService = professorAdminService;
    }

    @GetMapping
    public List<ProfessorUserResponse> listProfessors(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String year
    ) {
        return professorAdminService.listProfessors(query, department, year);
    }

    @GetMapping("/{id}")
    public ProfessorUserResponse getProfessor(@PathVariable Long id) {
        return professorAdminService.getProfessorById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProfessorUserResponse createProfessor(@Valid @RequestBody CreateProfessorRequest request,
                                                 Authentication auth) {
        return professorAdminService.createProfessor(request, auth != null ? auth.getName() : null);
    }

    @PostMapping("/bulk")
    public BulkProfessorUploadResult createProfessorsBulk(@RequestBody List<CreateProfessorRequest> requests,
                                                          Authentication auth) {
        return professorAdminService.createProfessorsBulk(requests, auth != null ? auth.getName() : null);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BulkProfessorUploadResult uploadFile(@RequestParam("file") MultipartFile file,
                                                Authentication auth) {
        return professorAdminService.uploadProfessorsFile(file, auth != null ? auth.getName() : null);
    }

    @GetMapping("/sample-template")
    public ResponseEntity<byte[]> getSampleTemplate(@RequestParam(defaultValue = "csv") String format) {
        if ("excel".equalsIgnoreCase(format) || "xlsx".equalsIgnoreCase(format)) {
            byte[] bytes = professorAdminService.generateSampleExcel();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sample_professor_credentials.xlsx\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(bytes);
        } else {
            byte[] bytes = professorAdminService.generateSampleCsv();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sample_professor_credentials.csv\"")
                    .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                    .body(bytes);
        }
    }

    @PutMapping("/{id}")
    public ProfessorUserResponse updateProfessor(@PathVariable Long id,
                                                 @Valid @RequestBody UpdateProfessorRequest request,
                                                 Authentication auth) {
        return professorAdminService.updateProfessor(id, request, auth != null ? auth.getName() : null);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteProfessor(@PathVariable Long id, Authentication auth) {
        professorAdminService.deleteProfessor(id, auth != null ? auth.getName() : null);
    }
}
