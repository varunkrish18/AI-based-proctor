package com.proctor.exam.controller;

import com.proctor.exam.dto.BulkStudentUploadResult;
import com.proctor.exam.dto.CreateStudentRequest;
import com.proctor.exam.dto.SectionPdfRequest;
import com.proctor.exam.dto.StudentUserResponse;
import com.proctor.exam.dto.UpdateStudentRequest;
import com.proctor.exam.service.StudentAdminService;
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
@RequestMapping("/api/admin/students")
public class AdminStudentController {

    private final StudentAdminService studentAdminService;

    public AdminStudentController(StudentAdminService studentAdminService) {
        this.studentAdminService = studentAdminService;
    }

    @GetMapping
    public List<StudentUserResponse> listStudents(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String year
    ) {
        return studentAdminService.listStudents(query, department, year);
    }

    @GetMapping("/{id}")
    public StudentUserResponse getStudent(@PathVariable Long id) {
        return studentAdminService.getStudentById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StudentUserResponse createStudent(@Valid @RequestBody CreateStudentRequest request,
                                            Authentication auth) {
        return studentAdminService.createStudent(request, auth != null ? auth.getName() : null);
    }

    @PostMapping("/bulk")
    public BulkStudentUploadResult createStudentsBulk(@RequestBody List<CreateStudentRequest> requests,
                                                      Authentication auth) {
        return studentAdminService.createStudentsBulk(requests, auth != null ? auth.getName() : null);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BulkStudentUploadResult uploadFile(@RequestParam("file") MultipartFile file,
                                              Authentication auth) {
        return studentAdminService.uploadStudentsFile(file, auth != null ? auth.getName() : null);
    }

    @GetMapping("/sample-template")
    public ResponseEntity<byte[]> getSampleTemplate(@RequestParam(defaultValue = "csv") String format) {
        if ("excel".equalsIgnoreCase(format) || "xlsx".equalsIgnoreCase(format)) {
            byte[] bytes = studentAdminService.generateSampleExcel();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sample_student_credentials.xlsx\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(bytes);
        } else {
            byte[] bytes = studentAdminService.generateSampleCsv();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sample_student_credentials.csv\"")
                    .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                    .body(bytes);
        }
    }

    @PostMapping("/sections/pdf")
    public ResponseEntity<byte[]> downloadSectionPdf(@RequestBody SectionPdfRequest request) {
        byte[] pdf = studentAdminService.generateSectionPdf(request);
        String rawName = (request.sectionName() != null && !request.sectionName().isBlank())
                ? request.sectionName() : "Section";
        String filename = rawName.replaceAll("[^a-zA-Z0-9_-]", "_") + "_Students.pdf";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    @PostMapping("/sections/zip")
    public ResponseEntity<byte[]> downloadSectionsZip(@RequestBody List<SectionPdfRequest> requests) {
        byte[] zip = studentAdminService.generateSectionsZip(requests);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"Student_Sections_PDFs.zip\"")
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(zip);
    }

    @PutMapping("/{id}")
    public StudentUserResponse updateStudent(@PathVariable Long id,
                                            @Valid @RequestBody UpdateStudentRequest request,
                                            Authentication auth) {
        return studentAdminService.updateStudent(id, request, auth != null ? auth.getName() : null);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteStudent(@PathVariable Long id, Authentication auth) {
        studentAdminService.deleteStudent(id, auth != null ? auth.getName() : null);
    }
}
