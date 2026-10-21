package com.proctor.exam.service;

import com.proctor.exam.dto.BulkStudentUploadResult;
import com.proctor.exam.dto.CreateStudentRequest;
import com.proctor.exam.dto.StudentUserResponse;
import com.proctor.exam.dto.UpdateStudentRequest;
import com.proctor.exam.entity.Student;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.StudentRepository;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.awt.Color;
import com.lowagie.text.Document;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Font;
import com.lowagie.text.Element;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPCell;
import com.proctor.exam.dto.SectionPdfRequest;

@Service
public class StudentAdminService {

    private final StudentRepository studentRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;
    private static final PasswordEncoder STUDENT_PASSWORD_ENCODER = new BCryptPasswordEncoder(4);
    private static final String PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    public StudentAdminService(StudentRepository studentRepository,
                               PasswordEncoder passwordEncoder,
                               AuditLogService auditLogService) {
        this.studentRepository = studentRepository;
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

    public List<StudentUserResponse> listStudents(String query, String department, String year) {
        String cleanQuery = (query != null && !query.trim().isBlank()) ? query.trim() : null;
        String cleanDept = (department != null && !department.trim().isBlank() && !"ALL".equalsIgnoreCase(department)) ? department.trim() : null;
        String cleanYear = (year != null && !year.trim().isBlank() && !"ALL".equalsIgnoreCase(year)) ? year.trim() : null;

        List<Student> students;
        if (cleanQuery == null && cleanDept == null && cleanYear == null) {
            students = studentRepository.findAllByOrderByIdDesc();
        } else {
            students = studentRepository.searchStudents(cleanQuery, cleanDept, cleanYear);
        }

        return students.stream()
                .map(this::toResponse)
                .toList();
    }

    public StudentUserResponse getStudentById(Long id) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Student not found with id: " + id));
        return toResponse(student);
    }

    @Transactional
    public StudentUserResponse createStudent(CreateStudentRequest request, String callerEmail) {
        String email = request.email().trim().toLowerCase();
        if (studentRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "A student with email '" + email + "' already exists.");
        }

        String regNumber = request.registerNumber() != null ? request.registerNumber().trim() : "";
        if (!regNumber.isBlank() && studentRepository.findByRegisterNumberIgnoreCase(regNumber).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "A student with register number '" + regNumber + "' already exists.");
        }

        String rawPassword = (request.password() != null && !request.password().trim().isBlank())
                ? request.password().trim()
                : generateSecurePassword();

        Student student = Student.builder()
                .fullName(request.fullName().trim())
                .department(request.department() != null ? request.department().trim() : null)
                .registerNumber(regNumber.isBlank() ? null : regNumber)
                .year(request.year() != null ? request.year().trim() : null)
                .email(email)
                .displayPassword(rawPassword)
                .passwordHash(STUDENT_PASSWORD_ENCODER.encode(rawPassword))
                .build();

        student = studentRepository.save(student);

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "CREATE_STUDENT",
                    "Created student account: " + student.getEmail() + " (" + student.getRegisterNumber() + ") by " + callerEmail);
        }

        return toResponse(student);
    }

    @Transactional
    public StudentUserResponse updateStudent(Long id, UpdateStudentRequest request, String callerEmail) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Student not found with id: " + id));

        String newEmail = request.email().trim().toLowerCase();
        studentRepository.findByEmailIgnoreCase(newEmail).ifPresent(existing -> {
            if (!existing.getId().equals(id)) {
                throw new ApiException(HttpStatus.CONFLICT, "Another student is already registered with email '" + newEmail + "'.");
            }
        });

        String newReg = request.registerNumber() != null ? request.registerNumber().trim() : "";
        if (!newReg.isBlank()) {
            studentRepository.findByRegisterNumberIgnoreCase(newReg).ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw new ApiException(HttpStatus.CONFLICT, "Another student is already registered with register number '" + newReg + "'.");
                }
            });
        }

        student.setFullName(request.fullName().trim());
        student.setEmail(newEmail);
        student.setRegisterNumber(newReg.isBlank() ? null : newReg);
        student.setDepartment(request.department() != null ? request.department().trim() : null);
        student.setYear(request.year() != null ? request.year().trim() : null);

        if (request.password() != null && !request.password().trim().isBlank()) {
            String rawPassword = request.password().trim();
            student.setDisplayPassword(rawPassword);
            student.setPasswordHash(STUDENT_PASSWORD_ENCODER.encode(rawPassword));
        }

        student = studentRepository.save(student);

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "UPDATE_STUDENT",
                    "Updated student account: " + student.getEmail() + " by " + callerEmail);
        }

        return toResponse(student);
    }

    @Transactional
    public void deleteStudent(Long id, String callerEmail) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Student not found with id: " + id));

        studentRepository.delete(student);

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "DELETE_STUDENT",
                    "Deleted student account: " + student.getEmail() + " (" + student.getRegisterNumber() + ") by " + callerEmail);
        }
    }

    @Transactional
    public void deleteAllStudents(String callerEmail) {
        long count = studentRepository.count();
        studentRepository.deleteAllInBatch();

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "DELETE_ALL_STUDENTS",
                    "Deleted all student credentials (" + count + " students) by " + callerEmail);
        }
    }

    @Transactional
    public BulkStudentUploadResult createStudentsBulk(List<CreateStudentRequest> requests, String callerEmail) {
        int total = requests.size();
        if (total == 0) {
            return new BulkStudentUploadResult(0, 0, 0, Collections.emptyList(), Collections.emptyList());
        }

        int created = 0;
        int updated = 0;
        List<String> errors = new ArrayList<>();
        List<StudentUserResponse> savedStudents = new ArrayList<>();

        // Optimization 1: Pre-calculate BCrypt hashes in parallel for all distinct passwords
        final String defaultPassword = "student123";
        Set<String> distinctPasswords = requests.stream()
                .map(r -> (r.password() != null && !r.password().trim().isBlank()) ? r.password().trim() : defaultPassword)
                .collect(Collectors.toSet());

        Map<String, String> passwordHashMap = new ConcurrentHashMap<>();
        distinctPasswords.parallelStream().forEach(pwd -> {
            passwordHashMap.put(pwd, STUDENT_PASSWORD_ENCODER.encode(pwd));
        });

        // Optimization 2: Pre-fetch existing students and emails in bulk to avoid N+1 queries in the loop
        Set<String> allExistingEmailsLower = new HashSet<>(studentRepository.findAllEmailsLower());

        Set<String> incomingRegNumbersLower = requests.stream()
                .map(CreateStudentRequest::registerNumber)
                .filter(r -> r != null && !r.trim().isBlank())
                .map(r -> r.trim().toLowerCase())
                .collect(Collectors.toSet());

        Map<String, Student> existingStudentsByRegLower = new HashMap<>();
        if (!incomingRegNumbersLower.isEmpty()) {
            List<Student> matchedByReg = studentRepository.findAllByRegisterNumberLowerIn(incomingRegNumbersLower);
            for (Student s : matchedByReg) {
                if (s.getRegisterNumber() != null) {
                    existingStudentsByRegLower.put(s.getRegisterNumber().trim().toLowerCase(), s);
                }
            }
        }

        Set<String> incomingEmailsLower = requests.stream()
                .map(CreateStudentRequest::email)
                .filter(e -> e != null && !e.trim().isBlank())
                .map(e -> e.trim().toLowerCase())
                .collect(Collectors.toSet());

        Map<String, Student> existingStudentsByEmailLower = new HashMap<>();
        if (!incomingEmailsLower.isEmpty()) {
            List<Student> matchedByEmail = studentRepository.findAllByEmailLowerIn(incomingEmailsLower);
            for (Student s : matchedByEmail) {
                if (s.getEmail() != null) {
                    existingStudentsByEmailLower.put(s.getEmail().trim().toLowerCase(), s);
                }
            }
        }

        // Keep track of emails assigned in this upload batch
        Set<String> assignedEmailsInBatch = new HashSet<>();
        List<Student> studentsToSave = new ArrayList<>(total);
        Set<Student> scheduledForSave = Collections.newSetFromMap(new IdentityHashMap<>());

        for (int i = 0; i < requests.size(); i++) {
            CreateStudentRequest req = requests.get(i);
            int rowNum = i + 1;

            String regNumber = (req.registerNumber() != null && !req.registerNumber().trim().isBlank())
                    ? req.registerNumber().trim()
                    : null;
            String rawEmail = (req.email() != null && !req.email().trim().isBlank())
                    ? req.email().trim().toLowerCase()
                    : null;
            String name = (req.fullName() != null && !req.fullName().trim().isBlank())
                    ? req.fullName().trim()
                    : (regNumber != null ? "Student " + regNumber : (rawEmail != null ? rawEmail.split("@")[0] : "Student " + rowNum));
            String department = (req.department() != null && !req.department().trim().isBlank())
                    ? req.department().trim()
                    : null;
            String year = (req.year() != null && !req.year().trim().isBlank())
                    ? req.year().trim()
                    : null;
            String password = (req.password() != null && !req.password().trim().isBlank())
                    ? req.password().trim()
                    : defaultPassword;
            String encodedPassword = passwordHashMap.getOrDefault(password, STUDENT_PASSWORD_ENCODER.encode(password));

            // 1. Identify existing student in memory
            Student existing = null;
            if (regNumber != null) {
                existing = existingStudentsByRegLower.get(regNumber.toLowerCase());
            }

            if (existing == null && rawEmail != null && !assignedEmailsInBatch.contains(rawEmail)) {
                Student candidate = existingStudentsByEmailLower.get(rawEmail);
                if (candidate != null) {
                    if (candidate.getRegisterNumber() == null || candidate.getRegisterNumber().isBlank()
                            || (regNumber != null && candidate.getRegisterNumber().equalsIgnoreCase(regNumber))) {
                        existing = candidate;
                    }
                }
            }

            if (existing != null) {
                // UPDATE existing student
                existing.setFullName(name);
                if (regNumber != null) existing.setRegisterNumber(regNumber);
                if (department != null) existing.setDepartment(department);
                if (year != null) existing.setYear(year);
                if (req.password() != null && !req.password().trim().isBlank()) {
                    existing.setDisplayPassword(password);
                    existing.setPasswordHash(encodedPassword);
                }

                // If user supplied a new distinct email and it's available, update it
                if (rawEmail != null && !rawEmail.equalsIgnoreCase(existing.getEmail())) {
                    if (!assignedEmailsInBatch.contains(rawEmail) && !allExistingEmailsLower.contains(rawEmail)) {
                        allExistingEmailsLower.remove(existing.getEmail().toLowerCase());
                        existing.setEmail(rawEmail);
                        allExistingEmailsLower.add(rawEmail);
                    }
                }
                assignedEmailsInBatch.add(existing.getEmail().toLowerCase());

                if (scheduledForSave.add(existing)) {
                    studentsToSave.add(existing);
                    updated++;
                }
            } else {
                // CREATE NEW STUDENT
                String assignedEmail = resolveUniqueEmail(rawEmail, name, regNumber, rowNum, assignedEmailsInBatch, allExistingEmailsLower);
                assignedEmailsInBatch.add(assignedEmail.toLowerCase());
                allExistingEmailsLower.add(assignedEmail.toLowerCase());

                Student newStudent = Student.builder()
                        .email(assignedEmail)
                        .fullName(name)
                        .registerNumber(regNumber)
                        .department(department)
                        .year(year)
                        .displayPassword(password)
                        .passwordHash(encodedPassword)
                        .build();

                if (regNumber != null) {
                    existingStudentsByRegLower.put(regNumber.toLowerCase(), newStudent);
                }
                existingStudentsByEmailLower.put(assignedEmail.toLowerCase(), newStudent);

                if (scheduledForSave.add(newStudent)) {
                    studentsToSave.add(newStudent);
                    created++;
                }
            }
        }

        // Optimization 3: Batch persist all students in a single saveAll call
        List<Student> savedList = studentRepository.saveAll(studentsToSave);
        for (Student s : savedList) {
            savedStudents.add(toResponse(s));
        }

        if (callerEmail != null) {
            auditLogService.logAdmin(callerEmail, "BULK_STUDENT_UPLOAD",
                    "Bulk uploaded " + total + " students (Created: " + created + ", Updated: " + updated + ") by " + callerEmail);
        }

        return new BulkStudentUploadResult(total, created, updated, errors, savedStudents);
    }

    private String resolveUniqueEmail(String rawEmail, String name, String regNumber, int rowNum,
                                       Set<String> assignedEmailsInBatch, Set<String> allExistingEmailsLower) {
        // If rawEmail is provided, valid, not used in this batch, and not taken in DB:
        if (rawEmail != null && rawEmail.contains("@")) {
            String candidate = rawEmail.trim().toLowerCase();
            if (!assignedEmailsInBatch.contains(candidate) && !allExistingEmailsLower.contains(candidate)) {
                return candidate;
            }
        }

        // Determine domain
        String domain = "example.com";
        if (rawEmail != null && rawEmail.contains("@")) {
            String d = rawEmail.substring(rawEmail.indexOf('@') + 1).trim().toLowerCase();
            if (!d.isBlank() && d.contains(".")) {
                domain = d;
            }
        }

        // Base prefix: prefer cleanReg or cleanName.cleanReg
        String cleanReg = regNumber != null ? regNumber.trim().toLowerCase().replaceAll("[^a-z0-9]", "") : "";
        String cleanName = name != null ? name.trim().toLowerCase().replaceAll("[^a-z0-9]", ".") : "";

        String basePrefix;
        if (!cleanReg.isBlank()) {
            if (!cleanName.isBlank() && !cleanName.equalsIgnoreCase("student")) {
                basePrefix = cleanName + "." + cleanReg;
            } else {
                basePrefix = cleanReg;
            }
        } else if (!cleanName.isBlank()) {
            basePrefix = cleanName;
        } else {
            basePrefix = "student" + rowNum;
        }

        basePrefix = basePrefix.replaceAll("\\.+", ".").replaceAll("^\\.|\\.$", "");
        if (basePrefix.isBlank()) {
            basePrefix = "student" + rowNum;
        }

        String candidate = basePrefix + "@" + domain;
        if (!assignedEmailsInBatch.contains(candidate) && !allExistingEmailsLower.contains(candidate)) {
            return candidate;
        }

        int counter = 1;
        while (true) {
            String testEmail = basePrefix + "." + counter + "@" + domain;
            if (!assignedEmailsInBatch.contains(testEmail) && !allExistingEmailsLower.contains(testEmail)) {
                return testEmail;
            }
            counter++;
        }
    }

    public BulkStudentUploadResult uploadStudentsFile(MultipartFile file, String callerEmail) {
        if (file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "File is empty.");
        }

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        List<CreateStudentRequest> parsedRequests;

        if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
            parsedRequests = parseExcelFile(file);
        } else if (filename.endsWith(".csv") || filename.endsWith(".txt")) {
            parsedRequests = parseCsvFile(file);
        } else {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
        }

        if (parsedRequests.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No student data rows found in the uploaded file.");
        }

        return createStudentsBulk(parsedRequests, callerEmail);
    }

    private List<CreateStudentRequest> parseCsvFile(MultipartFile file) {
        List<CreateStudentRequest> list = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) return list;

            Map<String, Integer> colMap = mapHeaders(parseCsvTokens(headerLine));

            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                List<String> tokens = parseCsvTokens(line);
                CreateStudentRequest req = extractStudentFromTokens(tokens, colMap);
                if (req != null) list.add(req);
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to read CSV file: " + e.getMessage());
        }
        return list;
    }

    private List<CreateStudentRequest> parseExcelFile(MultipartFile file) {
        List<CreateStudentRequest> list = new ArrayList<>();
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet.getPhysicalNumberOfRows() == 0) return list;

            DataFormatter formatter = new DataFormatter();
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) return list;

            List<String> headerTokens = new ArrayList<>();
            for (int c = 0; c < headerRow.getLastCellNum(); c++) {
                Cell cell = headerRow.getCell(c);
                headerTokens.add(formatter.formatCellValue(cell).trim());
            }

            Map<String, Integer> colMap = mapHeaders(headerTokens);

            int headerCount = headerRow.getLastCellNum();
            for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;

                int maxCols = Math.max(headerCount, (int) row.getLastCellNum());
                List<String> tokens = new ArrayList<>();
                for (int c = 0; c < maxCols; c++) {
                    Cell cell = row.getCell(c);
                    tokens.add(formatter.formatCellValue(cell).trim());
                }

                CreateStudentRequest req = extractStudentFromTokens(tokens, colMap);
                if (req != null) list.add(req);
            }
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to parse Excel file: " + e.getMessage());
        }
        return list;
    }

    private Map<String, Integer> mapHeaders(List<String> headers) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            String norm = normalizeKey(headers.get(i));
            if (norm.equals("name") || norm.equals("fullname") || norm.equals("studentname")) {
                map.put("name", i);
            } else if (norm.equals("department") || norm.equals("dept") || norm.equals("branch")) {
                map.put("department", i);
            } else if (norm.equals("registernumber") || norm.equals("regnumber") || norm.equals("regno") || norm.equals("registrationnumber")) {
                map.put("registerNumber", i);
            } else if (norm.equals("year") || norm.equals("academicyear") || norm.equals("batch")) {
                map.put("year", i);
            } else if (norm.equals("mail") || norm.equals("email") || norm.equals("emailaddress")) {
                map.put("email", i);
            } else if (norm.equals("password") || norm.equals("pwd") || norm.equals("pass")) {
                map.put("password", i);
            }
        }
        return map;
    }

    private CreateStudentRequest extractStudentFromTokens(List<String> tokens, Map<String, Integer> colMap) {
        String name = getVal(tokens, colMap.get("name"));
        String department = getVal(tokens, colMap.get("department"));
        String registerNumber = getVal(tokens, colMap.get("registerNumber"));
        String year = getVal(tokens, colMap.get("year"));
        String email = getVal(tokens, colMap.get("email"));
        String password = getVal(tokens, colMap.get("password"));

        // Fallbacks if header mapping didn't find specific headers, use column order:
        // Name | department | Register number | year | mail | password
        if (email.isBlank() && tokens.size() >= 5) {
            if (name.isBlank() && tokens.size() > 0) name = tokens.get(0);
            if (department.isBlank() && tokens.size() > 1) department = tokens.get(1);
            if (registerNumber.isBlank() && tokens.size() > 2) registerNumber = tokens.get(2);
            if (year.isBlank() && tokens.size() > 3) year = tokens.get(3);
            if (email.isBlank() && tokens.size() > 4) email = tokens.get(4);
            if (password.isBlank() && tokens.size() > 5) password = tokens.get(5);
        }

        // Only skip if the entire row is blank
        if (name.isBlank() && department.isBlank() && registerNumber.isBlank() && year.isBlank() && email.isBlank() && password.isBlank()) {
            return null;
        }

        // If email is blank, provide a fallback placeholder so CreateStudentRequest has an email
        if (email.isBlank()) {
            String cleanReg = !registerNumber.isBlank() ? registerNumber.toLowerCase().replaceAll("[^a-z0-9]", "") : "";
            if (!cleanReg.isBlank()) {
                email = cleanReg + "@student.exam";
            } else if (!name.isBlank()) {
                email = name.toLowerCase().replaceAll("[^a-z0-9]", ".") + "@student.exam";
            } else {
                email = "student" + System.currentTimeMillis() + "@student.exam";
            }
        }

        return new CreateStudentRequest(
                name.isBlank() ? (registerNumber.isBlank() ? email.split("@")[0] : "Student " + registerNumber) : name,
                department.isBlank() ? null : department,
                registerNumber.isBlank() ? null : registerNumber,
                year.isBlank() ? null : year,
                email,
                password.isBlank() ? null : password
        );
    }

    private String getVal(List<String> tokens, Integer idx) {
        if (idx == null || idx < 0 || idx >= tokens.size()) return "";
        return tokens.get(idx).trim();
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
                sb.append(c);
            }
        }
        tokens.add(sb.toString().trim());
        return tokens;
    }

    public byte[] generateSampleCsv() {
        String csv = "Name,department,Register number,year,mail,password\n" +
                "Aarav Sharma,Computer Science & Engineering,21CS101,3rd Year,aarav.sharma@example.com,student123\n" +
                "Bhavya Patel,Information Technology,21IT102,3rd Year,bhavya.patel@example.com,student123\n" +
                "Chirag Reddy,Electronics & Communication Engineering,22EC103,2nd Year,chirag.reddy@example.com,student123\n" +
                "Divya Krishnan,Artificial Intelligence & Data Science,23AD104,1st Year,divya.krishnan@example.com,student123\n" +
                "Kavya Iyer,Electrical & Electronics Engineering,20EE105,4th Year,kavya.iyer@example.com,\n";
        return csv.getBytes(StandardCharsets.UTF_8);
    }

    public byte[] generateSampleExcel() {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Students");

            CellStyle headerStyle = wb.createCellStyle();
            org.apache.poi.ss.usermodel.Font headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            String[] headers = {"Name", "department", "Register number", "year", "mail", "password"};
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = headerRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
            }

            String[][] samples = {
                    {"Aarav Sharma", "Computer Science & Engineering", "21CS101", "3rd Year", "aarav.sharma@example.com", "student123"},
                    {"Bhavya Patel", "Information Technology", "21IT102", "3rd Year", "bhavya.patel@example.com", "student123"},
                    {"Chirag Reddy", "Electronics & Communication Engineering", "22EC103", "2nd Year", "chirag.reddy@example.com", "student123"},
                    {"Divya Krishnan", "Artificial Intelligence & Data Science", "23AD104", "1st Year", "divya.krishnan@example.com", "student123"},
                    {"Kavya Iyer", "Electrical & Electronics Engineering", "20EE105", "4th Year", "kavya.iyer@example.com", ""}
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
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate Excel template: " + e.getMessage());
        }
    }

    public byte[] generateSectionPdf(SectionPdfRequest request) {
        List<Student> students = resolveStudentsForSection(request);

        Document document = new Document(PageSize.A4.rotate(), 36, 36, 36, 36);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            // Fonts
            Font titleFont = new Font(Font.HELVETICA, 15, Font.BOLD, new Color(15, 23, 42));
            Font subTitleFont = new Font(Font.HELVETICA, 9.5f, Font.BOLD, new Color(71, 85, 105));
            Font metaLabelFont = new Font(Font.HELVETICA, 8.5f, Font.BOLD, new Color(71, 85, 105));
            Font metaValueFont = new Font(Font.HELVETICA, 8.5f, Font.BOLD, new Color(15, 23, 42));
            Font tableHeaderFont = new Font(Font.HELVETICA, 8.5f, Font.BOLD, Color.WHITE);
            Font bodyFont = new Font(Font.HELVETICA, 8f, Font.NORMAL, new Color(30, 41, 59));
            Font bodyBoldFont = new Font(Font.HELVETICA, 8f, Font.BOLD, new Color(15, 23, 42));
            Font monoFont = new Font(Font.COURIER, 8f, Font.BOLD, new Color(15, 23, 42));
            Font footerFont = new Font(Font.HELVETICA, 7.5f, Font.ITALIC, new Color(100, 116, 139));

            // Document Header
            Paragraph titlePara = new Paragraph("AI ONLINE EXAMINATION & PROCTORING SYSTEM", titleFont);
            titlePara.setAlignment(Element.ALIGN_CENTER);
            document.add(titlePara);

            Paragraph subTitlePara = new Paragraph("OFFICIAL STUDENT SECTION ALLOCATION & EXAMINATION CREDENTIALS", subTitleFont);
            subTitlePara.setAlignment(Element.ALIGN_CENTER);
            subTitlePara.setSpacingAfter(10f);
            document.add(subTitlePara);

            // Metadata Card Table
            PdfPTable metaTable = new PdfPTable(4);
            metaTable.setWidthPercentage(100);
            metaTable.setWidths(new float[]{1.3f, 2.7f, 1.3f, 2.7f});
            metaTable.setSpacingAfter(12f);

            String deptText = (request.department() != null && !request.department().isBlank())
                    ? request.department() : "All Departments";
            String secText = (request.sectionName() != null && !request.sectionName().isBlank())
                    ? request.sectionName() : "Section Allocation";
            String rangeText = "";
            if (request.startRegisterNumber() != null && !request.startRegisterNumber().isBlank()) {
                rangeText += request.startRegisterNumber();
            }
            if (request.endRegisterNumber() != null && !request.endRegisterNumber().isBlank()) {
                rangeText += (rangeText.isEmpty() ? "" : " to ") + request.endRegisterNumber();
            }
            if (rangeText.isEmpty()) rangeText = "Full Department Cohort";

            String genDate = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd-MMM-yyyy HH:mm:ss"));

            addMetaCell(metaTable, "Department:", metaLabelFont, deptText, metaValueFont);
            addMetaCell(metaTable, "Section Name:", metaLabelFont, secText, metaValueFont);
            addMetaCell(metaTable, "Register Range:", metaLabelFont, rangeText, metaValueFont);
            addMetaCell(metaTable, "Total Students:", metaLabelFont, students.size() + " Students Allocated", metaValueFont);
            addMetaCell(metaTable, "Generated On:", metaLabelFont, genDate, metaValueFont);
            addMetaCell(metaTable, "Classification:", metaLabelFont, "Confidential (Invigilator / Coordinator Copy)", metaValueFont);

            document.add(metaTable);

            // Students Table
            boolean showPasswords = !Boolean.FALSE.equals(request.includePasswords());
            PdfPTable studentTable;
            if (showPasswords) {
                studentTable = new PdfPTable(7);
                studentTable.setWidthPercentage(100);
                studentTable.setWidths(new float[]{0.5f, 2.7f, 2.0f, 1.2f, 2.6f, 2.6f, 1.8f});
                addTableHeader(studentTable, tableHeaderFont, "S.No", "Student Name", "Register Number", "Year", "Department", "Email / Username", "Password");
            } else {
                studentTable = new PdfPTable(6);
                studentTable.setWidthPercentage(100);
                studentTable.setWidths(new float[]{0.6f, 3.2f, 2.2f, 1.5f, 3.0f, 3.0f});
                addTableHeader(studentTable, tableHeaderFont, "S.No", "Student Name", "Register Number", "Year", "Department", "Email / Username");
            }

            int index = 1;
            for (Student s : students) {
                Color rowBg = (index % 2 == 0) ? new Color(248, 250, 252) : Color.WHITE;

                addCell(studentTable, String.valueOf(index), bodyFont, Element.ALIGN_CENTER, rowBg);
                addCell(studentTable, s.getFullName() != null ? s.getFullName() : "—", bodyBoldFont, Element.ALIGN_LEFT, rowBg);
                addCell(studentTable, s.getRegisterNumber() != null ? s.getRegisterNumber() : "—", monoFont, Element.ALIGN_CENTER, rowBg);
                addCell(studentTable, s.getYear() != null ? s.getYear() : "—", bodyFont, Element.ALIGN_CENTER, rowBg);
                addCell(studentTable, s.getDepartment() != null ? s.getDepartment() : "—", bodyFont, Element.ALIGN_LEFT, rowBg);
                addCell(studentTable, s.getEmail() != null ? s.getEmail() : "—", monoFont, Element.ALIGN_LEFT, rowBg);

                if (showPasswords) {
                    String pwd = s.getDisplayPassword() != null ? s.getDisplayPassword() : "••••••••";
                    addCell(studentTable, pwd, monoFont, Element.ALIGN_CENTER, rowBg);
                }

                index++;
            }

            if (students.isEmpty()) {
                PdfPCell emptyCell = new PdfPCell(new Phrase("No students found matching the selected section criteria or range.", bodyFont));
                emptyCell.setColspan(showPasswords ? 7 : 6);
                emptyCell.setPadding(15f);
                emptyCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                emptyCell.setBackgroundColor(new Color(254, 242, 242));
                studentTable.addCell(emptyCell);
            }

            document.add(studentTable);

            // Document Footer Notice
            Paragraph notice = new Paragraph(
                    "NOTICE: This document is classified for examination management. Login credentials must be kept confidential and distributed securely during authorized examination sessions.",
                    footerFont);
            notice.setSpacingBefore(10f);
            notice.setAlignment(Element.ALIGN_CENTER);
            document.add(notice);

        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to render Section PDF: " + e.getMessage());
        } finally {
            document.close();
        }

        return out.toByteArray();
    }

    public byte[] generateSectionsZip(List<SectionPdfRequest> requests) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (int i = 0; i < requests.size(); i++) {
                SectionPdfRequest req = requests.get(i);
                byte[] pdfBytes = generateSectionPdf(req);
                String rawName = (req.sectionName() != null && !req.sectionName().isBlank())
                        ? req.sectionName()
                        : ("Section_" + (char) ('A' + i));
                String safeName = rawName.replaceAll("[^a-zA-Z0-9_-]", "_");
                String filename = safeName + "_Students.pdf";

                ZipEntry entry = new ZipEntry(filename);
                zos.putNextEntry(entry);
                zos.write(pdfBytes);
                zos.closeEntry();
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create Sections ZIP: " + e.getMessage());
        }
        return baos.toByteArray();
    }

    private List<Student> resolveStudentsForSection(SectionPdfRequest req) {
        if (req.studentIds() != null && !req.studentIds().isEmpty()) {
            List<Student> list = new ArrayList<>(studentRepository.findAllById(req.studentIds()));
            list.sort(Comparator.comparing(
                    s -> s.getRegisterNumber() != null ? s.getRegisterNumber() : "",
                    String.CASE_INSENSITIVE_ORDER
            ));
            return list;
        }

        String dept = (req.department() != null && !req.department().trim().isBlank() && !"ALL".equalsIgnoreCase(req.department().trim()))
                ? req.department().trim() : null;

        List<Student> candidates;
        if (dept != null) {
            candidates = new ArrayList<>(studentRepository.searchStudents(null, dept, null));
        } else {
            candidates = new ArrayList<>(studentRepository.findAll());
        }

        candidates.sort(Comparator.comparing(
                s -> s.getRegisterNumber() != null ? s.getRegisterNumber() : "",
                String.CASE_INSENSITIVE_ORDER
        ));

        if ((req.startRegisterNumber() == null || req.startRegisterNumber().isBlank()) &&
            (req.endRegisterNumber() == null || req.endRegisterNumber().isBlank())) {
            return candidates;
        }

        String start = req.startRegisterNumber() != null ? req.startRegisterNumber().trim() : "";
        String end = req.endRegisterNumber() != null ? req.endRegisterNumber().trim() : "";

        return candidates.stream()
                .filter(s -> matchesRegisterRange(s.getRegisterNumber(), start, end))
                .toList();
    }

    private boolean matchesRegisterRange(String reg, String start, String end) {
        if (reg == null || reg.trim().isBlank()) return false;
        String cleanReg = reg.trim();
        String cleanStart = start != null ? start.trim() : "";
        String cleanEnd = end != null ? end.trim() : "";

        if (cleanStart.isEmpty() && cleanEnd.isEmpty()) return true;

        RegisterParts rParts = parseRegisterParts(cleanReg);
        RegisterParts sParts = !cleanStart.isEmpty() ? parseRegisterParts(cleanStart) : null;
        RegisterParts eParts = !cleanEnd.isEmpty() ? parseRegisterParts(cleanEnd) : null;

        if (rParts != null && (sParts != null || eParts != null)) {
            boolean prefixMatch = true;
            if (sParts != null && !sParts.prefix.equalsIgnoreCase(rParts.prefix)) prefixMatch = false;
            if (eParts != null && !eParts.prefix.equalsIgnoreCase(rParts.prefix)) prefixMatch = false;

            if (prefixMatch) {
                long num = rParts.number;
                long min = sParts != null ? sParts.number : Long.MIN_VALUE;
                long max = eParts != null ? eParts.number : Long.MAX_VALUE;
                return num >= min && num <= max;
            }
        }

        if (!cleanStart.isEmpty() && cleanReg.compareToIgnoreCase(cleanStart) < 0) return false;
        if (!cleanEnd.isEmpty() && cleanReg.compareToIgnoreCase(cleanEnd) > 0) return false;
        return true;
    }

    private record RegisterParts(String prefix, long number) {}

    private RegisterParts parseRegisterParts(String str) {
        int i = str.length() - 1;
        while (i >= 0 && Character.isDigit(str.charAt(i))) {
            i--;
        }
        if (i == str.length() - 1) {
            return null;
        }
        String prefix = str.substring(0, i + 1);
        String numStr = str.substring(i + 1);
        try {
            long num = Long.parseLong(numStr);
            return new RegisterParts(prefix, num);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void addMetaCell(PdfPTable table, String label, Font lf, String val, Font vf) {
        PdfPCell cell = new PdfPCell();
        cell.setPadding(4f);
        cell.setBorderColor(new Color(226, 232, 240));
        cell.setBackgroundColor(new Color(248, 250, 252));

        Paragraph p = new Paragraph();
        p.add(new Phrase(label + " ", lf));
        p.add(new Phrase(val != null ? val : "—", vf));
        cell.addElement(p);
        table.addCell(cell);
    }

    private void addTableHeader(PdfPTable table, Font font, String... headers) {
        for (String h : headers) {
            PdfPCell cell = new PdfPCell(new Phrase(h, font));
            cell.setBackgroundColor(new Color(30, 41, 59));
            cell.setBorderColor(new Color(51, 65, 85));
            cell.setPadding(6f);
            cell.setHorizontalAlignment(Element.ALIGN_CENTER);
            cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            table.addCell(cell);
        }
    }

    private void addCell(PdfPTable table, String text, Font font, int align, Color bg) {
        PdfPCell cell = new PdfPCell(new Phrase(text != null ? text : "—", font));
        cell.setBackgroundColor(bg);
        cell.setBorderColor(new Color(226, 232, 240));
        cell.setPadding(4.5f);
        cell.setHorizontalAlignment(align);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        table.addCell(cell);
    }

    private StudentUserResponse toResponse(Student s) {
        return new StudentUserResponse(
                s.getId(),
                s.getFullName(),
                s.getDepartment(),
                s.getRegisterNumber(),
                s.getYear(),
                s.getEmail(),
                s.getDisplayPassword(),
                s.getCreatedAt()
        );
    }
}
