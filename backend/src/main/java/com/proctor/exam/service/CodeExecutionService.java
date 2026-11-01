package com.proctor.exam.service;

import com.proctor.exam.dto.RunCodeResponse;
import com.proctor.exam.dto.TestCaseExecutionResult;
import com.proctor.exam.dto.TestCaseRequest;
import com.proctor.exam.entity.ExamQuestionTestCase;
import com.proctor.exam.exception.ApiException;
import com.proctor.exam.repository.ExamQuestionRepository;
import com.proctor.exam.repository.ExamQuestionTestCaseRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.*;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@Slf4j
public class CodeExecutionService {

    private static final int TIMEOUT_SECONDS = 5;
    private static final int MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB

    private final ExamQuestionRepository questionRepository;
    private final ExamQuestionTestCaseRepository testCaseRepository;

    public CodeExecutionService(ExamQuestionRepository questionRepository,
                                ExamQuestionTestCaseRepository testCaseRepository) {
        this.questionRepository = questionRepository;
        this.testCaseRepository = testCaseRepository;
    }

    /**
     * Runs student code against public (sample) test cases, or against custom input if provided.
     */
    public RunCodeResponse runPublicTestCases(Long questionId, String code, String language, String customInput) {
        questionRepository.findById(questionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Question not found."));

        if (customInput != null && !customInput.isBlank()) {
            TestCaseExecutionResult res = executeSingleCase(1, code, language, customInput, "");
            return new RunCodeResponse(res.status(), 1, res.passed() ? 1 : 0, res.executionTimeMs(), List.of(res));
        }

        List<ExamQuestionTestCase> cases = testCaseRepository.findByQuestionIdAndIsHiddenFalseOrderByDisplayOrderAsc(questionId);
        if (cases.isEmpty()) {
            // If no public test cases were flagged, fallback to taking the first test case
            List<ExamQuestionTestCase> all = testCaseRepository.findByQuestionIdOrderByDisplayOrderAsc(questionId);
            if (!all.isEmpty()) {
                cases = List.of(all.get(0));
            }
        }

        return executeTestCases(cases, code, language);
    }

    /**
     * Evaluates code against ALL test cases (both public and hidden) for final scoring.
     */
    public RunCodeResponse evaluateAllTestCases(Long questionId, String code, String language) {
        questionRepository.findById(questionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Question not found."));

        List<ExamQuestionTestCase> all = testCaseRepository.findByQuestionIdOrderByDisplayOrderAsc(questionId);
        return executeTestCases(all, code, language);
    }

    /**
     * Runs arbitrary code against a list of test cases (used in Admin preview).
     */
    public RunCodeResponse testRun(List<TestCaseRequest> testCases, String code, String language) {
        if (testCases == null || testCases.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "At least one testcase is required to test run.");
        }

        List<TestCaseExecutionResult> results = new ArrayList<>();
        int passed = 0;
        long totalTime = 0;
        String overallStatus = "ACCEPTED";

        for (int i = 0; i < testCases.size(); i++) {
            TestCaseRequest tc = testCases.get(i);
            TestCaseExecutionResult res = executeSingleCase(
                    i + 1, code, language,
                    tc.input() != null ? tc.input() : "",
                    tc.expectedOutput() != null ? tc.expectedOutput() : ""
            );
            results.add(res);
            totalTime += res.executionTimeMs();
            if (res.passed()) {
                passed++;
            } else if ("ACCEPTED".equals(overallStatus)) {
                overallStatus = res.status();
            }
        }

        return new RunCodeResponse(overallStatus, testCases.size(), passed, totalTime, results);
    }

    private RunCodeResponse executeTestCases(List<ExamQuestionTestCase> cases, String code, String language) {
        if (cases == null || cases.isEmpty()) {
            return new RunCodeResponse("NO_TEST_CASES", 0, 0, 0, Collections.emptyList());
        }

        List<TestCaseExecutionResult> results = new ArrayList<>();
        int passed = 0;
        long totalTime = 0;
        String overallStatus = "ACCEPTED";

        for (int i = 0; i < cases.size(); i++) {
            ExamQuestionTestCase tc = cases.get(i);
            TestCaseExecutionResult res = executeSingleCase(
                    i + 1, code, language,
                    tc.getInput() != null ? tc.getInput() : "",
                    tc.getExpectedOutput() != null ? tc.getExpectedOutput() : ""
            );
            results.add(res);
            totalTime += res.executionTimeMs();
            if (res.passed()) {
                passed++;
            } else if ("ACCEPTED".equals(overallStatus)) {
                overallStatus = res.status();
            }
        }

        return new RunCodeResponse(overallStatus, cases.size(), passed, totalTime, results);
    }

    /**
     * Executes ad-hoc code without requiring a saved exam question ID (used by the Online IDE).
     */
    public RunCodeResponse runAdhocCode(String code, String language, String customInput) {
        if (code == null || code.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Code cannot be empty.");
        }
        TestCaseExecutionResult res = executeSingleCase(1, code, language, customInput != null ? customInput : "", "");
        return new RunCodeResponse(res.status(), 1, res.passed() ? 1 : 0, res.executionTimeMs(), List.of(res));
    }

    private TestCaseExecutionResult executeSingleCase(int caseIndex, String code, String rawLanguage,
                                                      String input, String expectedOutput) {
        String lang = rawLanguage != null ? rawLanguage.trim().toLowerCase() : "python";
        Path tempDir = null;
        long startTime = System.currentTimeMillis();

        try {
            tempDir = createExecutionTempDir();
            List<String> command = buildCommand(lang, code, tempDir);

            if (command == null || command.isEmpty()) {
                log.info("Local compiler command unavailable for {}; falling back to cloud online execution engines", lang);
                return executeViaOnlineEngine(caseIndex, code, lang, input, expectedOutput);
            }

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(tempDir.toFile());
            injectCompilerPath(pb);

            Process process;
            try {
                process = pb.start();
            } catch (IOException ioEx) {
                log.warn("Local execution command failed ({}); falling back to online execution engine: {}", command, ioEx.getMessage());
                return executeViaOnlineEngine(caseIndex, code, lang, input, expectedOutput);
            }

            // Feed input via stdin asynchronously
            try (OutputStream os = process.getOutputStream()) {
                if (input != null && !input.isEmpty()) {
                    os.write(input.getBytes(StandardCharsets.UTF_8));
                    if (!input.endsWith("\n")) {
                        os.write("\n".getBytes(StandardCharsets.UTF_8));
                    }
                }
                os.flush();
            } catch (IOException ignored) {
                // Process might have terminated early
            }

            // Capture stdout and stderr
            Future<String> stdoutFuture = captureStreamAsync(process.getInputStream());
            Future<String> stderrFuture = captureStreamAsync(process.getErrorStream());

            boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - startTime;

            if (!finished) {
                process.destroyForcibly();
                return new TestCaseExecutionResult(
                        caseIndex, input, expectedOutput, "", false,
                        "TIME_LIMIT_EXCEEDED", elapsed,
                        "Time Limit Exceeded (> " + TIMEOUT_SECONDS + " seconds)"
                );
            }

            int exitCode = process.exitValue();
            String stdout = stdoutFuture.get(1, TimeUnit.SECONDS);
            String stderr = stderrFuture.get(1, TimeUnit.SECONDS);

            if (exitCode != 0) {
                String errorMsg = !stderr.isBlank() ? stderr.trim() : "Process exited with non-zero exit code: " + exitCode;
                // If local toolchain missing/failed, or JRE lacking compiler module (JEP 330 InternalError)
                if (errorMsg.contains("is not recognized") ||
                        errorMsg.contains("not found") ||
                        errorMsg.contains("Cannot run program") ||
                        errorMsg.contains("Module jdk.compiler not in boot Layer") ||
                        errorMsg.contains("jdk.compiler") ||
                        errorMsg.contains("A JNI error has occurred") ||
                        errorMsg.contains("check your installation and try again") ||
                        errorMsg.contains("InternalError")) {
                    log.info("Process indicated missing/incomplete local toolchain ('{}'). Falling back to online engine.", errorMsg);
                    return executeViaOnlineEngine(caseIndex, code, lang, input, expectedOutput);
                }
                String status = errorMsg.contains("SyntaxError") || errorMsg.contains("error:") ? "COMPILATION_ERROR" : "RUNTIME_ERROR";
                return new TestCaseExecutionResult(
                        caseIndex, input, expectedOutput, stdout != null ? stdout.trim() : "",
                        false, status, elapsed, errorMsg
                );
            }

            String actualTrimmed = stdout != null ? stdout.trim() : "";
            String expectedTrimmed = expectedOutput != null ? expectedOutput.trim() : "";

            // Normalize CRLF to LF for comparison
            actualTrimmed = actualTrimmed.replace("\r\n", "\n");
            expectedTrimmed = expectedTrimmed.replace("\r\n", "\n");

            boolean passed = expectedTrimmed.isEmpty() || actualTrimmed.equals(expectedTrimmed);
            String status = passed ? "ACCEPTED" : "WRONG_ANSWER";

            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, actualTrimmed, passed,
                    status, elapsed, null
            );

        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - startTime;
            log.error("Local execution error for case {}: {}. Attempting online execution engine fallback.", caseIndex, e.getMessage());
            try {
                return executeViaOnlineEngine(caseIndex, code, lang, input, expectedOutput);
            } catch (Exception onlineEx) {
                String msg = e.getMessage() != null ? e.getMessage() : "Unknown execution error";
                String status = msg.contains("COMPILATION_ERROR") ? "COMPILATION_ERROR" : "RUNTIME_ERROR";
                String cleanMsg = msg.replace("COMPILATION_ERROR: ", "");
                return new TestCaseExecutionResult(
                        caseIndex, input, expectedOutput, "", false,
                        status, elapsed, cleanMsg
                );
            }
        } finally {
            if (tempDir != null) {
                deleteRecursivelyQuietly(tempDir);
            }
        }
    }

    // =========================================================================
    // MULTI-ENGINE COMPILER FALLBACK SYSTEM
    // Automatically attempts up to 5 diverse cloud compiler services in sequence.
    // If one is congested, down, or fails, execution immediately shifts to the next.
    // =========================================================================

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(6))
            .build();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    // 1. Wandbox API
    private static final String WANDBOX_API_URL = "https://wandbox.org/api/compile.json";
    // 2. Judge0 CE API
    private static final String JUDGE0_API_URL = "https://ce.judge0.com/submissions?base64_encoded=false&wait=true";
    // 3. Rextester API
    private static final String REXTESTER_API_URL = "https://rextester.com/rundotnet/api";
    // 4. CodeX API
    private static final String CODEX_API_URL = "https://api.codex.jaagrav.in";
    // 5. Paiza.IO API
    private static final String PAIZA_CREATE_URL = "https://api.paiza.io/runners/create";
    private static final String PAIZA_DETAILS_URL = "https://api.paiza.io/runners/get_details";
    // 6. Piston API (Additional backup)
    private static final String PISTON_API_URL = "https://emkc.org/api/v2/piston/execute";

    @FunctionalInterface
    private interface CompilerExecutor {
        TestCaseExecutionResult execute(String code, String normLang, String input, String expectedOutput, long overallStartTime) throws Exception;
    }

    private record OnlineCompilerEngine(String name, CompilerExecutor executor) {}

    private TestCaseExecutionResult executeViaOnlineEngine(int caseIndex, String code, String language,
                                                           String input, String expectedOutput) {
        long overallStartTime = System.currentTimeMillis();
        String normLang = language != null ? language.toLowerCase().trim() : "python";

        // Five online compiler engines (+ Piston backup) organized in an automatic fallback chain:
        // If one fails or is congested/down, it automatically falls back to the next one!
        List<OnlineCompilerEngine> engines = List.of(
                new OnlineCompilerEngine("Wandbox", (c, lang, in, exp, start) -> executeViaWandbox(caseIndex, c, lang, in, exp, start)),
                new OnlineCompilerEngine("Judge0 CE", (c, lang, in, exp, start) -> executeViaJudge0(caseIndex, c, lang, in, exp, start)),
                new OnlineCompilerEngine("Rextester", (c, lang, in, exp, start) -> executeViaRextester(caseIndex, c, lang, in, exp, start)),
                new OnlineCompilerEngine("CodeX", (c, lang, in, exp, start) -> executeViaCodeX(caseIndex, c, lang, in, exp, start)),
                new OnlineCompilerEngine("Paiza.IO", (c, lang, in, exp, start) -> executeViaPaiza(caseIndex, c, lang, in, exp, start)),
                new OnlineCompilerEngine("Piston", (c, lang, in, exp, start) -> executeViaPiston(caseIndex, c, lang, in, exp, start))
        );

        TestCaseExecutionResult lastResult = null;

        for (int i = 0; i < engines.size(); i++) {
            OnlineCompilerEngine engine = engines.get(i);
            try {
                log.info("[Compiler Engine {}/{}: {}] Running case {} (language: {})...",
                        i + 1, engines.size(), engine.name(), caseIndex, normLang);

                TestCaseExecutionResult res = engine.executor().execute(code, normLang, input, expectedOutput, overallStartTime);

                if (res != null) {
                    // Valid program outcome (ACCEPTED or WRONG_ANSWER)
                    if ("ACCEPTED".equals(res.status()) || "WRONG_ANSWER".equals(res.status())) {
                        log.info("[Compiler Engine {}] Succeeded for case {} with status: {}", engine.name(), caseIndex, res.status());
                        return res;
                    }

                    // Legitimate code compilation error (e.g. syntax error in student code)
                    if ("COMPILATION_ERROR".equals(res.status())) {
                        log.info("[Compiler Engine {}] Code has compilation error for case {}: {}", engine.name(), caseIndex, res.errorMessage());
                        return res;
                    }

                    // Legitimate runtime error from student code (e.g. ZeroDivisionError, ArrayIndexOutOfBounds)
                    if ("RUNTIME_ERROR".equals(res.status()) && !isInfrastructureFailure(res.errorMessage())) {
                        log.info("[Compiler Engine {}] Student code produced runtime error for case {}: {}", engine.name(), caseIndex, res.errorMessage());
                        return res;
                    }

                    // Time limit exceeded
                    if ("TIME_LIMIT_EXCEEDED".equals(res.status())) {
                        log.info("[Compiler Engine {}] Execution timed out for case {}", engine.name(), caseIndex);
                        return res;
                    }

                    // Infrastructure or remote server error — log warning and fall back to next compiler engine
                    log.warn("[Compiler Engine {}] Infrastructure issue for case {}: '{}'. Falling back to next engine...",
                            engine.name(), caseIndex, res.errorMessage());
                    lastResult = res;
                }
            } catch (Exception ex) {
                log.warn("[Compiler Engine {}] Execution failed with exception for case {}: {}. Falling back to next engine...",
                        engine.name(), caseIndex, ex.getMessage());
            }
        }

        long elapsed = System.currentTimeMillis() - overallStartTime;
        return lastResult != null ? lastResult : new TestCaseExecutionResult(
                caseIndex, input, expectedOutput, "", false,
                "RUNTIME_ERROR", elapsed,
                "All online compilers (Wandbox, Judge0, Rextester, CodeX, Paiza.IO) are currently busy or unavailable. Please try again shortly."
        );
    }

    private boolean isInfrastructureFailure(String errorMsg) {
        if (errorMsg == null || errorMsg.isBlank()) {
            return true;
        }
        String lower = errorMsg.toLowerCase();
        return lower.contains("http ") ||
                lower.contains("connection refused") ||
                lower.contains("connect timed out") ||
                lower.contains("read timed out") ||
                lower.contains("timed out") ||
                lower.contains("resource temporarily unavailable") ||
                lower.contains("oci runtime error") ||
                lower.contains("rate limit") ||
                lower.contains("busy") ||
                lower.contains("service unavailable") ||
                lower.contains("internal server error") ||
                lower.contains("online execution error") ||
                lower.contains("cloud execution services are currently busy") ||
                lower.contains("gateway timeout") ||
                lower.contains("bad gateway") ||
                lower.contains("unauthorized") ||
                lower.contains("quota exceeded") ||
                lower.contains("internal execution error") ||
                lower.contains("execution timed out");
    }

    private TestCaseExecutionResult evaluateOutput(int caseIndex, String input, String expectedOutput,
                                                   String rawOutput, long elapsed) {
        String actualTrimmed = rawOutput != null ? rawOutput.replace("\r\n", "\n").trim() : "";
        String expectedTrimmed = expectedOutput != null ? expectedOutput.replace("\r\n", "\n").trim() : "";
        boolean passed = expectedTrimmed.isEmpty() || actualTrimmed.equals(expectedTrimmed);
        String status = passed ? "ACCEPTED" : "WRONG_ANSWER";

        return new TestCaseExecutionResult(
                caseIndex, input, expectedOutput, actualTrimmed, passed,
                status, elapsed, null
        );
    }

    private String normalizeJavaCode(String code) {
        if (code == null) return "";
        // Online compiler environments compile code in a fixed file name (prog.java, Main.java, Solution.java, etc.).
        // Replacing 'public class' with 'class' prevents javac from rejecting mismatched class and file names.
        return code.replaceAll("public\\s+(final\\s+)?class\\s+", "class ");
    }

    // ==========================================
    // 1. WANDBOX COMPILER ENGINE
    // ==========================================
    private TestCaseExecutionResult executeViaWandbox(int caseIndex, String code, String normLang,
                                                     String input, String expectedOutput, long overallStartTime) throws Exception {
        String compiler = mapCompilerForWandbox(normLang);
        String processedCode = "java".equals(normLang) || compiler.contains("openjdk")
                ? normalizeJavaCode(code)
                : code;

        Map<String, Object> payload = Map.of(
                "compiler", compiler,
                "code", processedCode,
                "stdin", input != null ? input : ""
        );

        String requestBody = MAPPER.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(WANDBOX_API_URL))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long elapsed = System.currentTimeMillis() - overallStartTime;

        if (response.statusCode() != 200) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Wandbox returned HTTP " + response.statusCode()
            );
        }

        JsonNode root = MAPPER.readTree(response.body());
        String statusStr = root.path("status").asText("0");
        String compilerErr = root.path("compiler_error").asText("");
        String compilerOut = root.path("compiler_output").asText("");
        String progOut = root.path("program_output").asText("");
        String progErr = root.path("program_error").asText("");

        // Check compilation error
        if (!"0".equals(statusStr) && (!compilerErr.isBlank() || !compilerOut.isBlank()) && progOut.isEmpty()) {
            String errMsg = !compilerErr.isBlank() ? compilerErr : compilerOut;
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "COMPILATION_ERROR", elapsed, errMsg.trim()
            );
        }

        // Check runtime error
        if (!"0".equals(statusStr)) {
            String errMsg = !progErr.isBlank() ? progErr : (!compilerErr.isBlank() ? compilerErr : "Process exited with status " + statusStr);
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, progOut.trim(), false,
                    "RUNTIME_ERROR", elapsed, errMsg.trim()
            );
        }

        return evaluateOutput(caseIndex, input, expectedOutput, progOut, elapsed);
    }

    // ==========================================
    // 2. JUDGE0 CE COMPILER ENGINE
    // ==========================================
    private TestCaseExecutionResult executeViaJudge0(int caseIndex, String code, String normLang,
                                                    String input, String expectedOutput, long overallStartTime) throws Exception {
        int languageId = mapLanguageIdForJudge0(normLang);
        String processedCode = "java".equals(normLang) ? normalizeJavaCode(code) : code;

        Map<String, Object> payload = new HashMap<>();
        payload.put("language_id", languageId);
        payload.put("source_code", processedCode);
        payload.put("stdin", input != null ? input : "");

        String requestBody = MAPPER.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(JUDGE0_API_URL))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(12))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long elapsed = System.currentTimeMillis() - overallStartTime;

        if (response.statusCode() != 200 && response.statusCode() != 201) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Judge0 returned HTTP " + response.statusCode()
            );
        }

        JsonNode root = MAPPER.readTree(response.body());
        JsonNode statusObj = root.path("status");
        int statusId = statusObj.path("id").asInt(0);
        String statusDesc = statusObj.path("description").asText("");

        String stdout = root.path("stdout").asText("");
        String stderr = root.path("stderr").asText("");
        String compileOutput = root.path("compile_output").asText("");
        String message = root.path("message").asText("");

        // Status 6 = Compilation Error
        if (statusId == 6 || (!compileOutput.isBlank() && stdout.isEmpty())) {
            String errMsg = !compileOutput.isBlank() ? compileOutput : "Compilation Error";
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "COMPILATION_ERROR", elapsed, errMsg.trim()
            );
        }

        // Status 5 = Time Limit Exceeded
        if (statusId == 5) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "TIME_LIMIT_EXCEEDED", elapsed, "Time Limit Exceeded"
            );
        }

        // Status 13, 14 = Internal Error / Exec Format Error
        if (statusId == 13 || statusId == 14) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Judge0 internal execution error: " + statusDesc
            );
        }

        // Status 7-12 = Runtime Error
        if (statusId >= 7 && statusId <= 12) {
            String errMsg = !stderr.isBlank() ? stderr : (!message.isBlank() ? message : statusDesc);
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, stdout.trim(), false,
                    "RUNTIME_ERROR", elapsed, errMsg.trim()
            );
        }

        return evaluateOutput(caseIndex, input, expectedOutput, stdout, elapsed);
    }

    // ==========================================
    // 3. REXTESTER COMPILER ENGINE
    // ==========================================
    private TestCaseExecutionResult executeViaRextester(int caseIndex, String code, String normLang,
                                                       String input, String expectedOutput, long overallStartTime) throws Exception {
        int langChoice = mapLanguageIdForRextester(normLang);
        String processedCode = "java".equals(normLang) ? normalizeJavaCode(code) : code;

        String formData = "LanguageChoice=" + langChoice
                + "&Program=" + URLEncoder.encode(processedCode, StandardCharsets.UTF_8)
                + "&Input=" + URLEncoder.encode(input != null ? input : "", StandardCharsets.UTF_8)
                + "&CompilerArgs=";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(REXTESTER_API_URL))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .timeout(Duration.ofSeconds(12))
                .POST(HttpRequest.BodyPublishers.ofString(formData, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long elapsed = System.currentTimeMillis() - overallStartTime;

        if (response.statusCode() != 200) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Rextester returned HTTP " + response.statusCode()
            );
        }

        JsonNode root = MAPPER.readTree(response.body());
        String errors = root.path("Errors").asText("");
        String result = root.path("Result").asText("");

        // Check if there are compilation errors
        if (!errors.isBlank() && result.isEmpty()) {
            boolean isCompileErr = errors.contains("error:") || errors.contains("SyntaxError") ||
                    errors.contains("javac") || errors.contains("Line ");
            String status = isCompileErr ? "COMPILATION_ERROR" : "RUNTIME_ERROR";
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    status, elapsed, errors.trim()
            );
        }

        if (!errors.isBlank()) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, result.trim(), false,
                    "RUNTIME_ERROR", elapsed, errors.trim()
            );
        }

        return evaluateOutput(caseIndex, input, expectedOutput, result, elapsed);
    }

    // ==========================================
    // 4. CODEX COMPILER ENGINE
    // ==========================================
    private TestCaseExecutionResult executeViaCodeX(int caseIndex, String code, String normLang,
                                                   String input, String expectedOutput, long overallStartTime) throws Exception {
        String codexLang = mapLanguageForCodeX(normLang);
        String processedCode = "java".equals(normLang) ? normalizeJavaCode(code) : code;

        Map<String, Object> payload = Map.of(
                "code", processedCode,
                "language", codexLang,
                "input", input != null ? input : ""
        );

        String requestBody = MAPPER.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(CODEX_API_URL))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long elapsed = System.currentTimeMillis() - overallStartTime;

        if (response.statusCode() != 200) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "CodeX returned HTTP " + response.statusCode()
            );
        }

        JsonNode root = MAPPER.readTree(response.body());
        boolean success = root.path("success").asBoolean(true);
        String output = root.path("output").asText("");
        String error = root.path("error").asText("");

        if (!error.isBlank() && output.isEmpty()) {
            boolean isCompileErr = error.contains("error:") || error.contains("SyntaxError") ||
                    error.contains("javac") || error.contains("Compilation error");
            String status = isCompileErr ? "COMPILATION_ERROR" : "RUNTIME_ERROR";
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    status, elapsed, error.trim()
            );
        }

        if (!success && !error.isBlank()) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, output.trim(), false,
                    "RUNTIME_ERROR", elapsed, error.trim()
            );
        }

        return evaluateOutput(caseIndex, input, expectedOutput, output, elapsed);
    }

    // ==========================================
    // 5. PAIZA.IO COMPILER ENGINE
    // ==========================================
    private TestCaseExecutionResult executeViaPaiza(int caseIndex, String code, String normLang,
                                                   String input, String expectedOutput, long overallStartTime) throws Exception {
        String paizaLang = mapLanguageForPaiza(normLang);
        String processedCode = "java".equals(normLang) ? normalizeJavaCode(code) : code;

        String formData = "source_code=" + URLEncoder.encode(processedCode, StandardCharsets.UTF_8)
                + "&language=" + URLEncoder.encode(paizaLang, StandardCharsets.UTF_8)
                + "&input=" + URLEncoder.encode(input != null ? input : "", StandardCharsets.UTF_8)
                + "&api_key=guest";

        HttpRequest createRequest = HttpRequest.newBuilder()
                .uri(URI.create(PAIZA_CREATE_URL))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .timeout(Duration.ofSeconds(8))
                .POST(HttpRequest.BodyPublishers.ofString(formData, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> createResponse = HTTP_CLIENT.send(createRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long elapsed = System.currentTimeMillis() - overallStartTime;

        if (createResponse.statusCode() != 200) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Paiza.IO returned HTTP " + createResponse.statusCode()
            );
        }

        JsonNode createNode = MAPPER.readTree(createResponse.body());
        String runnerId = createNode.path("id").asText("");
        if (runnerId.isBlank()) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Paiza.IO did not return runner ID"
            );
        }

        // Poll for completion (up to ~6 seconds)
        String detailsBody = null;
        for (int poll = 0; poll < 14; poll++) {
            Thread.sleep(400);
            HttpRequest detailsReq = HttpRequest.newBuilder()
                    .uri(URI.create(PAIZA_DETAILS_URL + "?id=" + runnerId + "&api_key=guest"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> detailsResp = HTTP_CLIENT.send(detailsReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (detailsResp.statusCode() == 200) {
                JsonNode detailsNode = MAPPER.readTree(detailsResp.body());
                String status = detailsNode.path("status").asText("");
                if ("completed".equalsIgnoreCase(status)) {
                    detailsBody = detailsResp.body();
                    break;
                }
            }
        }

        elapsed = System.currentTimeMillis() - overallStartTime;

        if (detailsBody == null) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "TIME_LIMIT_EXCEEDED", elapsed, "Paiza.IO execution timed out"
            );
        }

        JsonNode res = MAPPER.readTree(detailsBody);
        int buildExitCode = res.path("build_exit_code").asInt(0);
        String buildStderr = res.path("build_stderr").asText("");
        int exitCode = res.path("exit_code").asInt(0);
        String stdout = res.path("stdout").asText("");
        String stderr = res.path("stderr").asText("");

        if (buildExitCode != 0) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "COMPILATION_ERROR", elapsed, !buildStderr.isBlank() ? buildStderr.trim() : "Build failed"
            );
        }

        if (exitCode != 0) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, stdout.trim(), false,
                    "RUNTIME_ERROR", elapsed, !stderr.isBlank() ? stderr.trim() : "Process exited with code " + exitCode
            );
        }

        return evaluateOutput(caseIndex, input, expectedOutput, stdout, elapsed);
    }

    // ==========================================
    // 6. PISTON COMPILER ENGINE (BACKUP)
    // ==========================================
    private TestCaseExecutionResult executeViaPiston(int caseIndex, String code, String normLang,
                                                    String input, String expectedOutput, long overallStartTime) throws Exception {
        String pistonLang = mapLanguageForPiston(normLang);
        String processedCode = "java".equals(normLang) ? normalizeJavaCode(code) : code;

        Map<String, Object> payload = Map.of(
                "language", pistonLang,
                "version", "*",
                "files", List.of(Map.of("content", processedCode)),
                "stdin", input != null ? input : ""
        );

        String requestBody = MAPPER.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(PISTON_API_URL))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long elapsed = System.currentTimeMillis() - overallStartTime;

        if (response.statusCode() != 200) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "RUNTIME_ERROR", elapsed, "Piston returned HTTP " + response.statusCode()
            );
        }

        JsonNode root = MAPPER.readTree(response.body());
        JsonNode compileNode = root.path("compile");
        JsonNode runNode = root.path("run");

        int compileCode = compileNode.path("code").asInt(0);
        String compileStderr = compileNode.path("stderr").asText("");
        String compileOutput = compileNode.path("output").asText("");

        if (compileCode != 0) {
            String errMsg = !compileStderr.isBlank() ? compileStderr : compileOutput;
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    "COMPILATION_ERROR", elapsed, errMsg.trim()
            );
        }

        int runCode = runNode.path("code").asInt(0);
        String stdout = runNode.path("stdout").asText("");
        String stderr = runNode.path("stderr").asText("");

        if (runCode != 0) {
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, stdout.trim(), false,
                    "RUNTIME_ERROR", elapsed, !stderr.isBlank() ? stderr.trim() : "Execution exited with code " + runCode
            );
        }

        return evaluateOutput(caseIndex, input, expectedOutput, stdout, elapsed);
    }

    // ==========================================
    // LANGUAGE & COMPILER MAPPINGS
    // ==========================================
    private String mapCompilerForWandbox(String normLang) {
        return switch (normLang) {
            case "java" -> "openjdk-jdk-21+35";
            case "c", "gcc", "clang" -> "gcc-13.2.0-c";
            case "cpp", "c++", "g++" -> "gcc-13.2.0";
            case "js", "javascript", "node" -> "nodejs-20.17.0";
            default -> "cpython-3.12.7";
        };
    }

    private int mapLanguageIdForJudge0(String normLang) {
        return switch (normLang) {
            case "java" -> 62;
            case "c", "gcc", "clang" -> 50;
            case "cpp", "c++", "g++" -> 54;
            case "js", "javascript", "node" -> 63;
            default -> 71;
        };
    }

    private int mapLanguageIdForRextester(String normLang) {
        return switch (normLang) {
            case "java" -> 4;
            case "c", "gcc", "clang" -> 6;
            case "cpp", "c++", "g++" -> 7;
            case "js", "javascript", "node" -> 23;
            default -> 24;
        };
    }

    private String mapLanguageForCodeX(String normLang) {
        return switch (normLang) {
            case "java" -> "java";
            case "c", "gcc", "clang" -> "c";
            case "cpp", "c++", "g++" -> "cpp";
            case "js", "javascript", "node" -> "js";
            default -> "py";
        };
    }

    private String mapLanguageForPaiza(String normLang) {
        return switch (normLang) {
            case "java" -> "java";
            case "c", "gcc", "clang" -> "c";
            case "cpp", "c++", "g++" -> "cpp";
            case "js", "javascript", "node" -> "javascript";
            default -> "python3";
        };
    }

    private String mapLanguageForPiston(String normLang) {
        return switch (normLang) {
            case "java" -> "java";
            case "c", "gcc", "clang" -> "c";
            case "cpp", "c++", "g++" -> "cpp";
            case "js", "javascript", "node" -> "javascript";
            default -> "python";
        };
    }

    private String getFileExtension(String normLang) {
        return switch (normLang) {
            case "java" -> "java";
            case "c" -> "c";
            case "cpp" -> "cpp";
            case "javascript" -> "js";
            default -> "py";
        };
    }

    private String extractJavaClassName(String code) {
        if (code == null) return "Solution";
        var matcher = java.util.regex.Pattern.compile("public\\s+(?:final\\s+)?class\\s+([A-Za-z0-9_]+)").matcher(code);
        if (matcher.find()) {
            return matcher.group(1);
        }
        var classMatcher = java.util.regex.Pattern.compile("class\\s+([A-Za-z0-9_]+)").matcher(code);
        if (classMatcher.find()) {
            return classMatcher.group(1);
        }
        return "Solution";
    }

    private synchronized String findJavaExecutable() {
        boolean isWin = System.getProperty("os.name", "").toLowerCase().contains("win");
        String exeName = isWin ? "java.exe" : "java";

        // 1. Current running JVM (Guaranteed since Spring Boot is running on Java!)
        String javaHome = System.getProperty("java.home");
        if (javaHome != null && !javaHome.isBlank()) {
            Path p = Paths.get(javaHome, "bin", exeName);
            if (Files.exists(p)) {
                return p.toAbsolutePath().toString();
            }
        }

        // 2. JAVA_HOME environment variable
        String envJavaHome = System.getenv("JAVA_HOME");
        if (envJavaHome != null && !envJavaHome.isBlank()) {
            Path p = Paths.get(envJavaHome, "bin", exeName);
            if (Files.exists(p)) {
                return p.toAbsolutePath().toString();
            }
        }

        return exeName;
    }

    private synchronized String findJavacExecutable() {
        boolean isWin = System.getProperty("os.name", "").toLowerCase().contains("win");
        String exeName = isWin ? "javac.exe" : "javac";

        String javaHome = System.getProperty("java.home");
        if (javaHome != null && !javaHome.isBlank()) {
            Path p = Paths.get(javaHome, "bin", exeName);
            if (Files.exists(p)) {
                return p.toAbsolutePath().toString();
            }
        }

        String envJavaHome = System.getenv("JAVA_HOME");
        if (envJavaHome != null && !envJavaHome.isBlank()) {
            Path p = Paths.get(envJavaHome.trim(), "bin", exeName);
            if (Files.exists(p)) {
                return p.toAbsolutePath().toString();
            }
        }

        // Search standard Windows JDK installations (Adoptium, Eclipse, Oracle, Microsoft)
        if (isWin) {
            String[] commonRoots = {
                "C:\\Program Files\\Eclipse Adoptium",
                "C:\\Program Files\\Java",
                "C:\\Program Files\\Microsoft"
            };
            for (String root : commonRoots) {
                File dir = new File(root);
                if (dir.exists() && dir.isDirectory()) {
                    File[] subdirs = dir.listFiles(File::isDirectory);
                    if (subdirs != null) {
                        for (File sub : subdirs) {
                            File candidate = new File(sub, "bin" + File.separator + exeName);
                            if (candidate.exists()) {
                                return candidate.getAbsolutePath();
                            }
                        }
                    }
                }
            }
        }

        try {
            Process p = new ProcessBuilder(exeName, "-version").start();
            if (p.waitFor(2, TimeUnit.SECONDS) && p.exitValue() == 0) {
                return exeName;
            }
        } catch (Exception ignored) {
        }

        return null;
    }

    private static volatile String cachedCCompilerPath = null;
    private static volatile String cachedCCompilerBinDir = null;

    private synchronized String findCCompiler() {
        if (cachedCCompilerPath != null) {
            File f = new File(cachedCCompilerPath);
            if (f.exists() || !cachedCCompilerPath.contains(File.separator)) {
                return cachedCCompilerPath;
            }
        }

        boolean isWin = System.getProperty("os.name", "").toLowerCase().contains("win");

        // 1. If Windows, try where.exe to get full path
        if (isWin) {
            for (String binName : List.of("gcc.exe", "clang.exe", "gcc", "clang")) {
                try {
                    Process p = new ProcessBuilder("where.exe", binName).start();
                    String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
                    if (p.waitFor(2, TimeUnit.SECONDS) && p.exitValue() == 0 && !out.isBlank()) {
                        String firstLine = out.lines().findFirst().orElse("").trim();
                        if (!firstLine.isEmpty() && new File(firstLine).exists()) {
                            cachedCCompilerPath = firstLine;
                            cachedCCompilerBinDir = new File(firstLine).getParent();
                            log.info("Found C compiler via where.exe: {}", cachedCCompilerPath);
                            return cachedCCompilerPath;
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        }

        // 2. Direct command names in PATH
        for (String cmd : List.of("gcc", "clang", "cc")) {
            try {
                Process p = new ProcessBuilder(cmd, "--version").start();
                if (p.waitFor(2, TimeUnit.SECONDS) && p.exitValue() == 0) {
                    cachedCCompilerPath = cmd;
                    return cmd;
                }
            } catch (Exception ignored) {
            }
        }

        // 3. Scan known standard Windows install paths
        List<String> directPaths = new ArrayList<>();
        String localAppData = System.getenv("LOCALAPPDATA");
        String userHome = System.getProperty("user.home");

        if (localAppData != null) {
            directPaths.add(localAppData + "\\Microsoft\\WinGet\\Packages\\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\llvm-mingw-20260616-ucrt-x86_64\\bin\\gcc.exe");
            directPaths.add(localAppData + "\\Microsoft\\WinGet\\Packages\\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\llvm-mingw-20260616-ucrt-x86_64\\bin\\clang.exe");
        }
        if (userHome != null) {
            directPaths.add(userHome + "\\AppData\\Local\\Microsoft\\WinGet\\Packages\\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\llvm-mingw-20260616-ucrt-x86_64\\bin\\gcc.exe");
            directPaths.add(userHome + "\\AppData\\Local\\Microsoft\\WinGet\\Packages\\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\llvm-mingw-20260616-ucrt-x86_64\\bin\\clang.exe");
        }
        directPaths.add("C:\\Program Files\\LLVM\\bin\\clang.exe");
        directPaths.add("C:\\mingw64\\bin\\gcc.exe");
        directPaths.add("C:\\msys64\\mingw64\\bin\\gcc.exe");
        directPaths.add("C:\\msys64\\ucrt64\\bin\\gcc.exe");
        directPaths.add("C:\\TDM-GCC-64\\bin\\gcc.exe");

        for (String path : directPaths) {
            File f = new File(path);
            if (f.exists() && f.canExecute()) {
                cachedCCompilerPath = f.getAbsolutePath();
                cachedCCompilerBinDir = f.getParent();
                log.info("Found C compiler at known path: {}", cachedCCompilerPath);
                return cachedCCompilerPath;
            }
        }

        // 4. Dynamic search in WinGet Packages directories (safely)
        List<File> wingetRoots = new ArrayList<>();
        if (localAppData != null) wingetRoots.add(new File(localAppData + "\\Microsoft\\WinGet\\Packages"));
        if (userHome != null) wingetRoots.add(new File(userHome + "\\AppData\\Local\\Microsoft\\WinGet\\Packages"));

        for (File wingetDir : wingetRoots) {
            if (wingetDir.exists() && wingetDir.isDirectory()) {
                try (var stream = Files.walk(wingetDir.toPath(), 5)) {
                    Optional<Path> found = stream
                            .filter(p -> {
                                String name = p.getFileName().toString();
                                return name.equalsIgnoreCase("gcc.exe") || name.equalsIgnoreCase("clang.exe");
                            })
                            .findFirst();
                    if (found.isPresent()) {
                        File exe = found.get().toFile();
                        cachedCCompilerPath = exe.getAbsolutePath();
                        cachedCCompilerBinDir = exe.getParent();
                        log.info("Dynamically found C compiler in WinGet: {}", cachedCCompilerPath);
                        return cachedCCompilerPath;
                    }
                } catch (Exception ignored) {
                }
            }
        }

        return null;
    }

    private void injectCompilerPath(ProcessBuilder pb) {
        if (cachedCCompilerBinDir != null) {
            Map<String, String> env = pb.environment();
            String existingPath = env.getOrDefault("PATH", env.getOrDefault("Path", ""));
            env.put("PATH", cachedCCompilerBinDir + File.pathSeparator + existingPath);
            env.put("Path", cachedCCompilerBinDir + File.pathSeparator + existingPath);
        }
    }

    private List<String> buildCommand(String language, String code, Path dir) throws IOException {
        switch (language) {
            case "c":
            case "gcc":
            case "clang":
            case "cpp":
            case "c++": {
                boolean isCpp = language.contains("++") || language.equals("cpp");
                Path sourceFile = dir.resolve(isCpp ? "solution.cpp" : "solution.c");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);
                boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
                Path exeFile = dir.resolve(isWindows ? "solution.exe" : "solution");

                String compiler = findCCompiler();
                if (compiler == null) {
                    log.info("Local C compiler not found; will use online execution engine.");
                    return null;
                }

                List<String> compileCmd = new ArrayList<>();
                compileCmd.add(compiler);
                compileCmd.add("-O2");
                compileCmd.add(sourceFile.toAbsolutePath().toString());
                compileCmd.add("-o");
                compileCmd.add(exeFile.toAbsolutePath().toString());
                compileCmd.add("-lm");

                ProcessBuilder compilePb = new ProcessBuilder(compileCmd);
                compilePb.directory(dir.toFile());
                injectCompilerPath(compilePb);

                Process compileProc;
                try {
                    compileProc = compilePb.start();
                } catch (IOException ex) {
                    log.warn("Cannot start compiler {}: {}", compiler, ex.getMessage());
                    return null;
                }

                Future<String> compileErr = captureStreamAsync(compileProc.getErrorStream());
                Future<String> compileOut = captureStreamAsync(compileProc.getInputStream());

                try {
                    boolean compiled = compileProc.waitFor(12, TimeUnit.SECONDS);
                    if (!compiled || compileProc.exitValue() != 0) {
                        String err = compileErr.get(2, TimeUnit.SECONDS);
                        if (err.isBlank()) err = compileOut.get(1, TimeUnit.SECONDS);

                        // Retry without -lm if linking math lib caused issues on certain toolchains
                        List<String> retryCmd = new ArrayList<>(compileCmd);
                        retryCmd.remove("-lm");
                        ProcessBuilder retryPb = new ProcessBuilder(retryCmd);
                        retryPb.directory(dir.toFile());
                        injectCompilerPath(retryPb);
                        Process retryProc = retryPb.start();
                        Future<String> retryErr = captureStreamAsync(retryProc.getErrorStream());
                        Future<String> retryOut = captureStreamAsync(retryProc.getInputStream());
                        boolean retryCompiled = retryProc.waitFor(12, TimeUnit.SECONDS);

                        if (!retryCompiled || retryProc.exitValue() != 0) {
                            String rErr = retryErr.get(2, TimeUnit.SECONDS);
                            if (rErr.isBlank()) rErr = retryOut.get(1, TimeUnit.SECONDS);
                            if (rErr.isBlank()) rErr = err;
                            throw new RuntimeException("COMPILATION_ERROR: " + (!rErr.isBlank() ? rErr.trim() : "Compilation failed"));
                        }
                    }
                } catch (InterruptedException | ExecutionException | TimeoutException e) {
                    throw new RuntimeException("COMPILATION_ERROR: " + e.getMessage());
                }

                exeFile.toFile().setExecutable(true, false);
                return List.of(exeFile.toAbsolutePath().toString());
            }
            case "python":
            case "python3":
            case "py": {
                Path file = dir.resolve("solution.py");
                Files.writeString(file, code, StandardCharsets.UTF_8);
                String pyCmd = System.getProperty("os.name", "").toLowerCase().contains("win") ? "python" : "python3";
                return List.of(pyCmd, file.toAbsolutePath().toString());
            }
            case "javascript":
            case "node":
            case "js": {
                Path file = dir.resolve("solution.js");
                Files.writeString(file, code, StandardCharsets.UTF_8);
                return List.of("node", file.toAbsolutePath().toString());
            }
            case "java": {
                String className = extractJavaClassName(code);
                Path sourceFile = dir.resolve(className + ".java");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);

                String javac = findJavacExecutable();
                if (javac == null) {
                    log.info("Local javac compiler not found (JRE only); falling back to online execution engine.");
                    return null;
                }

                ProcessBuilder compilePb = new ProcessBuilder(javac, "-encoding", "UTF-8", sourceFile.toAbsolutePath().toString());
                compilePb.directory(dir.toFile());
                Process compileProc;
                try {
                    compileProc = compilePb.start();
                } catch (IOException ex) {
                    log.warn("Cannot start javac {}: {}", javac, ex.getMessage());
                    return null;
                }

                Future<String> compileErr = captureStreamAsync(compileProc.getErrorStream());
                Future<String> compileOut = captureStreamAsync(compileProc.getInputStream());
                try {
                    boolean compiled = compileProc.waitFor(12, TimeUnit.SECONDS);
                    if (!compiled || compileProc.exitValue() != 0) {
                        String err = compileErr.get(2, TimeUnit.SECONDS);
                        if (err.isBlank()) err = compileOut.get(1, TimeUnit.SECONDS);
                        if (err.contains("Module jdk.compiler not in boot Layer") ||
                                err.contains("A JNI error has occurred") ||
                                err.contains("jdk.compiler") ||
                                err.contains("check your installation and try again") ||
                                err.contains("InternalError")) {
                            log.info("Javac launcher failed with module error ('{}'); falling back to online execution engine.", err.trim());
                            return null;
                        }
                        throw new RuntimeException("COMPILATION_ERROR: " + (!err.isBlank() ? err.trim() : "Java compilation failed"));
                    }
                } catch (InterruptedException | ExecutionException | TimeoutException e) {
                    throw new RuntimeException("COMPILATION_ERROR: " + e.getMessage());
                }

                String javaExe = findJavaExecutable();
                return List.of(javaExe, "-cp", dir.toAbsolutePath().toString(), className);
            }
            default:
                throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported programming language: " + language);
        }
    }

    private Future<String> captureStreamAsync(InputStream is) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<String> future = executor.submit(() -> {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int read;
            int total = 0;
            while ((read = is.read(buffer)) != -1) {
                if (total + read > MAX_OUTPUT_BYTES) {
                    baos.write(buffer, 0, MAX_OUTPUT_BYTES - total);
                    baos.write("\n... [output truncated]".getBytes(StandardCharsets.UTF_8));
                    break;
                }
                baos.write(buffer, 0, read);
                total += read;
            }
            return baos.toString(StandardCharsets.UTF_8);
        });
        executor.shutdown();
        return future;
    }

    private Path createExecutionTempDir() throws IOException {
        // Windows Application Control / Smart App Control blocks executing .exe files from AppData\Local\Temp (error 4551).
        // Creating the execution directory in the application sandbox directory avoids this restriction.
        try {
            Path baseDir = Paths.get(System.getProperty("user.dir", "."), ".exec_sandbox");
            if (!Files.exists(baseDir)) {
                Files.createDirectories(baseDir);
            }
            return Files.createTempDirectory(baseDir, "proctor-exec-");
        } catch (Exception e) {
            return Files.createTempDirectory("proctor-exec-" + UUID.randomUUID());
        }
    }

    private void deleteRecursivelyQuietly(Path path) {
        try {
            Files.walk(path)
                    .sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(File::delete);
        } catch (Exception ignored) {
        }
    }
}
