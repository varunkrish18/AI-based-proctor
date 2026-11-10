package com.proctor.exam.repository;

import com.proctor.exam.entity.Professor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProfessorRepository extends JpaRepository<Professor, Long> {
    Optional<Professor> findByEmail(String email);
    Optional<Professor> findByEmailIgnoreCase(String email);
    Optional<Professor> findByStaffCodeIgnoreCase(String staffCode);
    boolean existsByEmailIgnoreCase(String email);
    boolean existsByStaffCodeIgnoreCase(String staffCode);
    List<Professor> findAllByOrderByIdDesc();

    @Query("SELECT LOWER(p.email) FROM Professor p")
    List<String> findAllEmailsLower();

    @Query("SELECT LOWER(p.staffCode) FROM Professor p WHERE p.staffCode IS NOT NULL")
    List<String> findAllStaffCodesLower();

    @Query("SELECT p FROM Professor p WHERE LOWER(p.staffCode) IN :staffCodes")
    List<Professor> findAllByStaffCodeLowerIn(@Param("staffCodes") Collection<String> staffCodes);

    @Query("SELECT p FROM Professor p WHERE LOWER(p.email) IN :emails")
    List<Professor> findAllByEmailLowerIn(@Param("emails") Collection<String> emails);

    @Query("SELECT p FROM Professor p WHERE " +
           "(:query IS NULL OR :query = '' OR " +
           " LOWER(p.fullName) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           " LOWER(p.staffCode) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           " LOWER(p.email) LIKE LOWER(CONCAT('%', :query, '%'))) AND " +
           "(:department IS NULL OR :department = 'ALL' OR p.department = :department) AND " +
           "(:year IS NULL OR :year = 'ALL' OR p.year = :year) " +
           "ORDER BY p.id DESC")
    List<Professor> searchProfessors(@Param("query") String query,
                                    @Param("department") String department,
                                    @Param("year") String year);
}
