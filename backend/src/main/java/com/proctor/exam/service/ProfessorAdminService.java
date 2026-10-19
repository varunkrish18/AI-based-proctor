package com.proctor.exam.service;

import com.proctor.exam.dto.BulkProfessorUploadResult;
import com.proctor.exam.dto.CreateProfessorRequest;
import com.proctor.exam.dto.ProfessorUserResponse;
import com.proctor.exam.dto.UpdateProfessorRequest;
import com.proctor.exam.entity.Admin;
import com.proctor.exam.entity.Professor;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.AdminRepository;
import com.proctor.exam.repository.ProfessorRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class ProfessorAdminService {

    private final ProfessorRepository professorRepository;
    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;
    private static final PasswordEncoder PROF_PASSWORD_ENCODER = new BCryptPasswordEncoder(4);
    private static final String PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    public ProfessorAdminService(ProfessorRepository professorRepository,
                                 AdminRepository adminRepository,
                                 PasswordEncoder passwordEncoder,
                                 AuditLogService auditLogService) {
        this.professorRepository = professorRepository;
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogService = auditLogService;
    }

    public String generateSecurePassword() {
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            sb.append(PASSWORD_CHARS.charAt(RANDOM.nextInt(PASSWORD_CHARS.length())));
        }
        return sb.toString();
    }

    public List<ProfessorUserResponse> listProfessors(String query, String department, String year) {
        String cleanQuery = (query != null && !query.trim().isBlank()) ? query.trim() : null;
        String cleanDept = (department != null && !department.trim().isBlank() && !"ALL".equalsIgnoreCase(department)) ? department.trim() : null;
        String cleanYear = (year != null && !year.trim().isBlank() && !"ALL".equalsIgnoreCase(year)) ? year.trim() : null;

        List<Professor> professors;
        if (cleanQuery == null && cleanDept == null && cleanYear == null) {
            professors = professorRepository.findAllByOrderByIdDesc();
        } else {
            professors = professorRepository.searchProfessors(cleanQuery, cleanDept, cleanYear);
        }

        return professors.stream()
                .map(this::toResponse)
                .toList();
    }

    public ProfessorUserResponse getProfessorById(Long id) {
        Professor professor = professorRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Professor not found with id: " + id));
        return toResponse(professor);
    }

    @Transactional
    public ProfessorUserResponse createProfessor(CreateProfessorRequest request, String callerEmail) {
        String email = request.email().trim().toLowerCase();
        if (professorRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "A professor with email '" + email + "' already exists.");
        }

        String staffCode = request.staffCode() != null ? request.staffCode().trim() : "";
        if (!staffCode.isBlank() && professorRepository.findByStaffCodeIgnoreCase(staffCode).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "A professor with staff code '" + staffCode + "' already exists.");
        }

        String rawPassword = (request.password() != null && !request.password().trim().isBlank())
                ? request.password().trim()
                : generateSecurePassword();

        Professor professor = Professor.builder()
                .fullName(request.fullName().trim())
                .department(request.department() != null ? request.department().trim() : null)
                .staffCode(staffCode.isBlank() ? null : staffCode)
                .year(request.year() != null ? request.year().trim() : null)
                .email(email)
                .displayPassword(rawPassword)
                .passwordHash(PROF_PASSWORD_ENCODER.encode(rawPassword))
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        professor = professorRepository.save(professor);

        // Sync with admins table so professor can log into system
        syncWithAdminUser(professor, rawPassword);

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "CREATE_PROFESSOR",
                    "Created professor credentials: " + professor.getEmail() + " (" + professor.getStaffCode() + ") by " + callerEmail);
        }

        return toResponse(professor);
    }

    @Transactional
    public ProfessorUserResponse updateProfessor(Long id, UpdateProfessorRequest request, String callerEmail) {
        Professor professor = professorRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Professor not found with id: " + id));

        String newEmail = request.email().trim().toLowerCase();
        professorRepository.findByEmailIgnoreCase(newEmail).ifPresent(existing -> {
            if (!existing.getId().equals(id)) {
                throw new ApiException(HttpStatus.CONFLICT, "Another professor is already registered with email '" + newEmail + "'.");
            }
        });

        String newStaffCode = request.staffCode() != null ? request.staffCode().trim() : "";
        if (!newStaffCode.isBlank()) {
            professorRepository.findByStaffCodeIgnoreCase(newStaffCode).ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw new ApiException(HttpStatus.CONFLICT, "Another professor is already registered with staff code '" + newStaffCode + "'.");
                }
            });
        }

        professor.setFullName(request.fullName().trim());
        professor.setDepartment(request.department() != null ? request.department().trim() : null);
        professor.setStaffCode(newStaffCode.isBlank() ? null : newStaffCode);
        professor.setYear(request.year() != null ? request.year().trim() : null);
        String oldEmail = professor.getEmail();
        professor.setEmail(newEmail);
        professor.setUpdatedAt(Instant.now());

        String rawPassword = null;
        if (request.password() != null && !request.password().trim().isBlank()) {
            rawPassword = request.password().trim();
            professor.setDisplayPassword(rawPassword);
            professor.setPasswordHash(PROF_PASSWORD_ENCODER.encode(rawPassword));
        }

        professor = professorRepository.save(professor);

        // Update corresponding admin account
        if (oldEmail != null && !oldEmail.equalsIgnoreCase(newEmail)) {
            adminRepository.findByEmail(oldEmail.toLowerCase()).ifPresent(adminRepository::delete);
        }
        syncWithAdminUser(professor, rawPassword != null ? rawPassword : professor.getDisplayPassword());

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "UPDATE_PROFESSOR",
                    "Updated professor credentials: " + professor.getEmail() + " (" + professor.getStaffCode() + ") by " + callerEmail);
        }

        return toResponse(professor);
    }

    @Transactional
    public void deleteProfessor(Long id, String callerEmail) {
        Professor professor = professorRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Professor not found with id: " + id));

        String email = professor.getEmail();
        professorRepository.delete(professor);

        // Remove from admins table if role is PROFESSOR
        adminRepository.findByEmail(email.toLowerCase()).ifPresent(admin -> {
            if ("PROFESSOR".equalsIgnoreCase(admin.getRole())) {
                adminRepository.delete(admin);
            }
        });

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "DELETE_PROFESSOR",
                    "Deleted professor: " + email + " by " + callerEmail);
        }
    }

    private void syncWithAdminUser(Professor professor, String plainPassword) {
        if (professor.getEmail() == null) return;
        String emailLower = professor.getEmail().toLowerCase();
        Admin admin = adminRepository.findByEmail(emailLower).orElse(null);

        if (admin == null) {
            admin = Admin.builder()
                    .email(emailLower)
                    .fullName(professor.getFullName())
                    .department(professor.getDepartment())
                    .role("PROFESSOR")
                    .displayPassword(plainPassword)
                    .passwordHash(professor.getPasswordHash())
                    .failedAttempts(0)
                    .createdAt(Instant.now())
                    .updatedAt(Instant.now())
                    .build();
        } else {
            admin.setFullName(professor.getFullName());
            admin.setDepartment(professor.getDepartment());
            if ("PROFESSOR".equalsIgnoreCase(admin.getRole())) {
                if (plainPassword != null && !plainPassword.isBlank()) {
                    admin.setDisplayPassword(plainPassword);
                    admin.setPasswordHash(professor.getPasswordHash());
                }
            }
            admin.setUpdatedAt(Instant.now());
        }
        adminRepository.save(admin);
    }

    @Transactional
    public BulkProfessorUploadResult createProfessorsBulk(List<CreateProfessorRequest> requests, String callerEmail) {
        if (requests == null || requests.isEmpty()) {
            return new BulkProfessorUploadResult(0, 0, 0, List.of("No professor records provided in payload."), List.of());
        }

        int total = requests.size();
        int created = 0;
        int updated = 0;
        List<String> errors = new ArrayList<>();
        List<ProfessorUserResponse> savedProfessors = new ArrayList<>();

        final String defaultPassword = "profPass123";
        Set<String> distinctPasswords = requests.stream()
                .map(r -> (r.password() != null && !r.password().trim().isBlank()) ? r.password().trim() : defaultPassword)
                .collect(Collectors.toSet());

        Map<String, String> passwordHashMap = new ConcurrentHashMap<>();
        distinctPasswords.parallelStream().forEach(pwd -> {
            passwordHashMap.put(pwd, PROF_PASSWORD_ENCODER.encode(pwd));
        });

        Set<String> allExistingEmailsLower = new HashSet<>(professorRepository.findAllEmailsLower());

        Set<String> incomingStaffCodesLower = requests.stream()
                .map(CreateProfessorRequest::staffCode)
                .filter(s -> s != null && !s.trim().isBlank())
                .map(s -> s.trim().toLowerCase())
                .collect(Collectors.toSet());

        Map<String, Professor> existingProfessorsByCodeLower = new HashMap<>();
        if (!incomingStaffCodesLower.isEmpty()) {
            List<Professor> matchedByCode = professorRepository.findAllByStaffCodeLowerIn(incomingStaffCodesLower);
            for (Professor p : matchedByCode) {
                if (p.getStaffCode() != null) {
                    existingProfessorsByCodeLower.put(p.getStaffCode().trim().toLowerCase(), p);
                }
            }
        }

        Set<String> incomingEmailsLower = requests.stream()
                .map(CreateProfessorRequest::email)
                .filter(e -> e != null && !e.trim().isBlank())
                .map(e -> e.trim().toLowerCase())
                .collect(Collectors.toSet());

        Map<String, Professor> existingProfessorsByEmailLower = new HashMap<>();
        if (!incomingEmailsLower.isEmpty()) {
            List<Professor> matchedByEmail = professorRepository.findAllByEmailLowerIn(incomingEmailsLower);
            for (Professor p : matchedByEmail) {
                if (p.getEmail() != null) {
                    existingProfessorsByEmailLower.put(p.getEmail().trim().toLowerCase(), p);
                }
            }
        }

        Set<String> assignedEmailsInBatch = new HashSet<>();
        List<Professor> professorsToSave = new ArrayList<>(total);
        Set<Professor> scheduledForSave = Collections.newSetFromMap(new IdentityHashMap<>());

        for (int i = 0; i < requests.size(); i++) {
            CreateProfessorRequest req = requests.get(i);
            int rowNum = i + 1;

            String staffCode = (req.staffCode() != null && !req.staffCode().trim().isBlank())
                    ? req.staffCode().trim()
                    : null;
            String rawEmail = (req.email() != null && !req.email().trim().isBlank())
                    ? req.email().trim().toLowerCase()
                    : null;
            String name = (req.fullName() != null && !req.fullName().trim().isBlank())
                    ? req.fullName().trim()
                    : (staffCode != null ? "Prof " + staffCode : (rawEmail != null ? rawEmail.split("@")[0] : "Professor " + rowNum));
            String department = (req.department() != null && !req.department().trim().isBlank())
                    ? req.department().trim()
                    : null;
            String year = (req.year() != null && !req.year().trim().isBlank())
                    ? req.year().trim()
                    : null;
            String password = (req.password() != null && !req.password().trim().isBlank())
                    ? req.password().trim()
                    : defaultPassword;
            String encodedPassword = passwordHashMap.getOrDefault(password, PROF_PASSWORD_ENCODER.encode(password));

            // Identify existing professor in memory
            Professor existing = null;
            if (staffCode != null) {
                existing = existingProfessorsByCodeLower.get(staffCode.toLowerCase());
            }

            if (existing == null && rawEmail != null && !assignedEmailsInBatch.contains(rawEmail)) {
                Professor candidate = existingProfessorsByEmailLower.get(rawEmail);
                if (candidate != null) {
                    if (candidate.getStaffCode() == null || candidate.getStaffCode().isBlank()
                            || (staffCode != null && candidate.getStaffCode().equalsIgnoreCase(staffCode))) {
                        existing = candidate;
                    }
                }
            }

            if (existing != null) {
                // UPDATE existing professor
                existing.setFullName(name);
                if (staffCode != null) existing.setStaffCode(staffCode);
                if (department != null) existing.setDepartment(department);
                if (year != null) existing.setYear(year);
                if (req.password() != null && !req.password().trim().isBlank()) {
                    existing.setDisplayPassword(password);
                    existing.setPasswordHash(encodedPassword);
                }
                existing.setUpdatedAt(Instant.now());

                if (rawEmail != null && !rawEmail.equalsIgnoreCase(existing.getEmail())) {
                    if (!assignedEmailsInBatch.contains(rawEmail) && !allExistingEmailsLower.contains(rawEmail)) {
                        allExistingEmailsLower.remove(existing.getEmail().toLowerCase());
                        existing.setEmail(rawEmail);
                        allExistingEmailsLower.add(rawEmail);
                    }
                }
                assignedEmailsInBatch.add(existing.getEmail().toLowerCase());

                if (scheduledForSave.add(existing)) {
                    professorsToSave.add(existing);
                    updated++;
                }
            } else {
                // CREATE NEW PROFESSOR
                String assignedEmail = resolveUniqueEmail(rawEmail, name, staffCode, rowNum, assignedEmailsInBatch, allExistingEmailsLower);
                assignedEmailsInBatch.add(assignedEmail.toLowerCase());
                allExistingEmailsLower.add(assignedEmail.toLowerCase());

                Professor newProf = Professor.builder()
                        .email(assignedEmail)
                        .fullName(name)
                        .staffCode(staffCode)
                        .department(department)
                        .year(year)
                        .displayPassword(password)
                        .passwordHash(encodedPassword)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

                if (staffCode != null) {
                    existingProfessorsByCodeLower.put(staffCode.toLowerCase(), newProf);
                }
                existingProfessorsByEmailLower.put(assignedEmail.toLowerCase(), newProf);

                if (scheduledForSave.add(newProf)) {
                    professorsToSave.add(newProf);
                    created++;
                }
            }
        }

        // Batch save
        if (!professorsToSave.isEmpty()) {
            List<Professor> savedList = professorRepository.saveAll(professorsToSave);
            for (Professor p : savedList) {
                savedProfessors.add(toResponse(p));
                // Mirror into admin user table
                syncWithAdminUser(p, p.getDisplayPassword());
            }
        }

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "BULK_UPLOAD_PROFESSORS",
                    "Bulk uploaded professors: " + created + " created, " + updated + " updated by " + callerEmail);
        }

        return new BulkProfessorUploadResult(total, created, updated, errors, savedProfessors);
    }

    private String resolveUniqueEmail(String rawEmail, String name, String staffCode, int rowNum,
                                      Set<String> assignedEmailsInBatch, Set<String> allExistingEmailsLower) {
        String domain = "college.edu";
        if (rawEmail != null && !rawEmail.isBlank() && rawEmail.contains("@")) {
            if (!assignedEmailsInBatch.contains(rawEmail.toLowerCase()) && !allExistingEmailsLower.contains(rawEmail.toLowerCase())) {
                return rawEmail.toLowerCase();
            }
            domain = rawEmail.substring(rawEmail.indexOf('@') + 1);
        }

        String base;
        if (name != null && !name.isBlank()) {
            base = name.trim().toLowerCase().replaceAll("[^a-z0-9]", ".");
        } else if (staffCode != null && !staffCode.isBlank()) {
            base = staffCode.trim().toLowerCase().replaceAll("[^a-z0-9]", "");
        } else {
            base = "prof" + rowNum;
        }

        String candidate = base + "@" + domain;
        int counter = 1;
        while (assignedEmailsInBatch.contains(candidate.toLowerCase()) || allExistingEmailsLower.contains(candidate.toLowerCase())) {
            candidate = base + "." + counter + "@" + domain;
            counter++;
        }
        return candidate.toLowerCase();
    }

    public BulkProfessorUploadResult uploadProfessorsFile(MultipartFile file, String callerEmail) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Please provide a non-empty CSV or Excel file.");
        }

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        List<CreateProfessorRequest> requests = new ArrayList<>();

        try {
            if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
                requests = parseExcel(file);
            } else {
                requests = parseCsv(file);
            }
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to parse file: " + e.getMessage());
        }

        return createProfessorsBulk(requests, callerEmail);
    }

    private List<CreateProfessorRequest> parseExcel(MultipartFile file) throws IOException {
        List<CreateProfessorRequest> requests = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = wb.getSheetAt(0);
            if (sheet == null) return requests;

            Row headerRow = sheet.getRow(0);
            if (headerRow == null) return requests;

            Map<String, Integer> colMap = new HashMap<>();
            for (Cell cell : headerRow) {
                String val = cell.getStringCellValue().trim();
                colMap.put(normalizeKey(val), cell.getColumnIndex());
            }

            for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;

                String name = getCellValue(row, colMap.get("name"), colMap.get("fullname"), colMap.get("professorname"), colMap.get("profname"));
                String department = getCellValue(row, colMap.get("department"), colMap.get("dept"), colMap.get("branch"));
                String staffCode = getCellValue(row, colMap.get("staffcode"), colMap.get("profcode"), colMap.get("staffid"), colMap.get("code"));
                String year = getCellValue(row, colMap.get("year"), colMap.get("academicyear"), colMap.get("handlingyear"), colMap.get("batch"));
                String mail = getCellValue(row, colMap.get("mail"), colMap.get("email"), colMap.get("emailaddress"));
                String password = getCellValue(row, colMap.get("password"), colMap.get("pwd"), colMap.get("pass"));

                if (name.isBlank() && department.isBlank() && staffCode.isBlank() && mail.isBlank() && password.isBlank()) {
                    continue;
                }

                if (mail.isBlank()) {
                    String cleanCode = !staffCode.isBlank() ? staffCode.toLowerCase().replaceAll("[^a-z0-9]", "") : "";
                    if (!cleanCode.isBlank()) {
                        mail = cleanCode + "@college.edu";
                    } else if (!name.isBlank()) {
                        mail = name.toLowerCase().replaceAll("[^a-z0-9]", ".") + "@college.edu";
                    } else {
                        mail = "prof" + System.currentTimeMillis() + "@college.edu";
                    }
                }

                requests.add(new CreateProfessorRequest(
                        name.isBlank() ? (staffCode.isBlank() ? mail.split("@")[0] : "Prof " + staffCode) : name,
                        department.isBlank() ? null : department,
                        staffCode.isBlank() ? null : staffCode,
                        year.isBlank() ? null : year,
                        mail,
                        password.isBlank() ? null : password
                ));
            }
        }
        return requests;
    }

    private List<CreateProfessorRequest> parseCsv(MultipartFile file) throws IOException {
        List<CreateProfessorRequest> requests = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) return requests;

            List<String> headers = parseCsvTokens(headerLine);
            Map<String, Integer> colMap = new HashMap<>();
            for (int i = 0; i < headers.size(); i++) {
                colMap.put(normalizeKey(headers.get(i)), i);
            }

            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isBlank()) continue;
                List<String> tokens = parseCsvTokens(line);

                String name = getVal(tokens, colMap.get("name"), colMap.get("fullname"), colMap.get("professorname"), colMap.get("profname"));
                String department = getVal(tokens, colMap.get("department"), colMap.get("dept"), colMap.get("branch"));
                String staffCode = getVal(tokens, colMap.get("staffcode"), colMap.get("profcode"), colMap.get("staffid"), colMap.get("code"));
                String year = getVal(tokens, colMap.get("year"), colMap.get("academicyear"), colMap.get("handlingyear"), colMap.get("batch"));
                String mail = getVal(tokens, colMap.get("mail"), colMap.get("email"), colMap.get("emailaddress"));
                String password = getVal(tokens, colMap.get("password"), colMap.get("pwd"), colMap.get("pass"));

                if (name.isBlank() && department.isBlank() && staffCode.isBlank() && mail.isBlank() && password.isBlank()) {
                    continue;
                }

                if (mail.isBlank()) {
                    String cleanCode = !staffCode.isBlank() ? staffCode.toLowerCase().replaceAll("[^a-z0-9]", "") : "";
                    if (!cleanCode.isBlank()) {
                        mail = cleanCode + "@college.edu";
                    } else if (!name.isBlank()) {
                        mail = name.toLowerCase().replaceAll("[^a-z0-9]", ".") + "@college.edu";
                    } else {
                        mail = "prof" + System.currentTimeMillis() + "@college.edu";
                    }
                }

                requests.add(new CreateProfessorRequest(
                        name.isBlank() ? (staffCode.isBlank() ? mail.split("@")[0] : "Prof " + staffCode) : name,
                        department.isBlank() ? null : department,
                        staffCode.isBlank() ? null : staffCode,
                        year.isBlank() ? null : year,
                        mail,
                        password.isBlank() ? null : password
                ));
            }
        }
        return requests;
    }

    private String getCellValue(Row row, Integer... indices) {
        for (Integer idx : indices) {
            if (idx != null) {
                Cell c = row.getCell(idx);
                if (c != null) {
                    DataFormatter formatter = new DataFormatter();
                    String val = formatter.formatCellValue(c).trim();
                    if (!val.isBlank()) return val;
                }
            }
        }
        return "";
    }

    private String getVal(List<String> tokens, Integer... indices) {
        for (Integer idx : indices) {
            if (idx != null && idx >= 0 && idx < tokens.size()) {
                String val = tokens.get(idx).trim();
                if (!val.isBlank()) return val;
            }
        }
        return "";
    }

    private String normalizeKey(String key) {
        if (key == null) return "";
        return key.toLowerCase().replaceAll("[^a-z0-9]", "");
    }

    private List<String> parseCsvTokens(String line) {
        List<String> tokens = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                tokens.add(sb.toString().trim());
                sb.setLength(0);
            } else {
                tokens.add(sb.toString().trim());
            }
        }
        tokens.add(sb.toString().trim());
        return tokens;
    }

    public byte[] generateSampleCsv() {
        String csv = "Name,department,Staff code,year,mail,password\n" +
                "Dr. Ramesh Sundaram,Computer Science & Engineering,PROF-CS-01,3rd Year,ramesh.cs@college.edu,profPass123\n" +
                "Dr. Ananya Sharma,Information Technology,PROF-IT-02,3rd Year,ananya.it@college.edu,profPass123\n" +
                "Dr. Karthik Raman,Electronics & Communication Engineering,PROF-EC-03,2nd Year,karthik.ec@college.edu,profPass123\n" +
                "Dr. Meenakshi Sundar,Artificial Intelligence & Data Science,PROF-AD-04,1st Year,meenakshi.ad@college.edu,profPass123\n" +
                "Dr. Rajesh Kumar,Mechanical Engineering,PROF-ME-05,4th Year,rajesh.me@college.edu,\n";
        return csv.getBytes(StandardCharsets.UTF_8);
    }

    public byte[] generateSampleExcel() {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Professors");

            CellStyle headerStyle = wb.createCellStyle();
            org.apache.poi.ss.usermodel.Font headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            String[] headers = {"Name", "department", "Staff code", "year", "mail", "password"};
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = headerRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
            }

            String[][] samples = {
                    {"Dr. Ramesh Sundaram", "Computer Science & Engineering", "PROF-CS-01", "3rd Year", "ramesh.cs@college.edu", "profPass123"},
                    {"Dr. Ananya Sharma", "Information Technology", "PROF-IT-02", "3rd Year", "ananya.it@college.edu", "profPass123"},
                    {"Dr. Karthik Raman", "Electronics & Communication Engineering", "PROF-EC-03", "2nd Year", "karthik.ec@college.edu", "profPass123"},
                    {"Dr. Meenakshi Sundar", "Artificial Intelligence & Data Science", "PROF-AD-04", "1st Year", "meenakshi.ad@college.edu", "profPass123"},
                    {"Dr. Rajesh Kumar", "Mechanical Engineering", "PROF-ME-05", "4th Year", "rajesh.me@college.edu", ""}
            };

            for (int r = 0; r < samples.length; r++) {
                Row row = sheet.createRow(r + 1);
                for (int c = 0; c < samples[r].length; c++) {
                    row.createCell(c).setCellValue(samples[r][c]);
                }
            }

            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }

            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate sample Excel: " + e.getMessage());
        }
    }

    private ProfessorUserResponse toResponse(Professor p) {
        return new ProfessorUserResponse(
                p.getId(),
                p.getFullName(),
                p.getDepartment(),
                p.getStaffCode(),
                p.getYear(),
                p.getEmail(),
                p.getDisplayPassword(),
                p.getCreatedAt()
        );
    }
}
