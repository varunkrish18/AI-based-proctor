package com.proctor.exam.repository;

import com.proctor.exam.entity.Student;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<Student, Long> {
    Optional<Student> findByEmail(String email);
    Optional<Student> findByEmailIgnoreCase(String email);
    Optional<Student> findByRegisterNumberIgnoreCase(String registerNumber);
    boolean existsByEmailIgnoreCase(String email);
    boolean existsByRegisterNumberIgnoreCase(String registerNumber);
    List<Student> findAllByOrderByIdDesc();

    @Query("SELECT LOWER(s.email) FROM Student s")
    List<String> findAllEmailsLower();

    @Query("SELECT LOWER(s.registerNumber) FROM Student s WHERE s.registerNumber IS NOT NULL")
    List<String> findAllRegisterNumbersLower();

    @Query("SELECT s FROM Student s WHERE LOWER(s.registerNumber) IN :regNumbers")
    List<Student> findAllByRegisterNumberLowerIn(@Param("regNumbers") java.util.Collection<String> regNumbers);

    @Query("SELECT s FROM Student s WHERE LOWER(s.email) IN :emails")
    List<Student> findAllByEmailLowerIn(@Param("emails") java.util.Collection<String> emails);

    @Query("SELECT s FROM Student s WHERE " +
           "(:query IS NULL OR :query = '' OR " +
           " LOWER(s.fullName) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           " LOWER(s.registerNumber) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           " LOWER(s.email) LIKE LOWER(CONCAT('%', :query, '%'))) AND " +
           "(:department IS NULL OR :department = 'ALL' OR s.department = :department) AND " +
           "(:year IS NULL OR :year = 'ALL' OR s.year = :year) " +
           "ORDER BY s.id DESC")
    List<Student> searchStudents(@Param("query") String query,
                                 @Param("department") String department,
                                 @Param("year") String year);
}
