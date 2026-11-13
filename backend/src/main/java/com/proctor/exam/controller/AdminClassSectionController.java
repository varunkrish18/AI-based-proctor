package com.proctor.exam.controller;

import com.proctor.exam.dto.ClassSectionDto;
import com.proctor.exam.service.ClassSectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/sections")
@RequiredArgsConstructor
public class AdminClassSectionController {

    private final ClassSectionService classSectionService;

    @GetMapping
    public List<ClassSectionDto> getAllSections() {
        return classSectionService.getAllSections();
    }

    @PutMapping
    public List<ClassSectionDto> saveAllSections(@RequestBody List<ClassSectionDto> sections) {
        return classSectionService.saveAllSections(sections);
    }

    @PostMapping
    public List<ClassSectionDto> createOrUpdateSections(@RequestBody List<ClassSectionDto> sections) {
        return classSectionService.saveAllSections(sections);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSection(@PathVariable String id) {
        classSectionService.deleteSection(id);
    }
}

