package com.proctor.exam.repository;

import com.proctor.exam.entity.ClassSection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClassSectionRepository extends JpaRepository<ClassSection, String> {
    List<ClassSection> findAllByOrderByDisplayOrderAscCreatedAtAsc();
}

