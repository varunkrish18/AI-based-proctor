package com.proctor.exam.service;

import com.proctor.exam.dto.ClassSectionDto;
import com.proctor.exam.entity.ClassSection;
import com.proctor.exam.repository.ClassSectionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ClassSectionService {

    private final ClassSectionRepository classSectionRepository;

    @Transactional(readOnly = true)
    public List<ClassSectionDto> getAllSections() {
        return classSectionRepository.findAllByOrderByDisplayOrderAscCreatedAtAsc().stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public List<ClassSectionDto> saveAllSections(List<ClassSectionDto> dtos) {
        if (dtos == null) {
            return List.of();
        }

        classSectionRepository.deleteAllInBatch();
        List<ClassSection> entities = new ArrayList<>();

        for (int i = 0; i < dtos.size(); i++) {
            ClassSectionDto d = dtos.get(i);
            String id = (d.id() != null && !d.id().trim().isBlank())
                    ? d.id().trim()
                    : ("cls-" + UUID.randomUUID());

            entities.add(ClassSection.builder()
                    .id(id)
                    .className(d.className() != null ? d.className().trim() : "Section")
                    .department(d.department() != null ? d.department().trim() : null)
                    .year(d.year() != null ? d.year().trim() : null)
                    .startReg(d.startReg() != null ? d.startReg().trim() : "")
                    .endReg(d.endReg() != null ? d.endReg().trim() : "")
                    .displayOrder(i)
                    .build());
        }

        List<ClassSection> saved = classSectionRepository.saveAll(entities);
        log.info("Saved {} class sections into database", saved.size());
        return saved.stream().map(this::toDto).toList();
    }

    @Transactional
    public void deleteSection(String id) {
        if (id != null && classSectionRepository.existsById(id)) {
            classSectionRepository.deleteById(id);
            log.info("Deleted class section {}", id);
        }
    }

    private ClassSectionDto toDto(ClassSection s) {
        return new ClassSectionDto(
                s.getId(),
                s.getClassName(),
                s.getDepartment(),
                s.getYear(),
                s.getStartReg(),
                s.getEndReg(),
                s.getDisplayOrder()
        );
    }
}

