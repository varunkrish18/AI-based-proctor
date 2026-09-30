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
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

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

    private TestCaseExecutionResult executeSingleCase(int caseIndex, String code, String rawLanguage,
                                                      String input, String expectedOutput) {
        String lang = rawLanguage != null ? rawLanguage.trim().toLowerCase() : "python";
        Path tempDir = null;
        long startTime = System.currentTimeMillis();

        try {
            tempDir = Files.createTempDirectory("proctor-exec-" + UUID.randomUUID());
            List<String> command = buildCommand(lang, code, tempDir);

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(tempDir.toFile());

            Process process = pb.start();

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
                String status = errorMsg.contains("SyntaxError") ? "COMPILATION_ERROR" : "RUNTIME_ERROR";
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
            log.error("Execution error for case {}: {}", caseIndex, e.getMessage());
            String msg = e.getMessage() != null ? e.getMessage() : "Unknown execution error";
            String status = msg.contains("COMPILATION_ERROR") ? "COMPILATION_ERROR" : "RUNTIME_ERROR";
            String cleanMsg = msg.replace("COMPILATION_ERROR: ", "");
            return new TestCaseExecutionResult(
                    caseIndex, input, expectedOutput, "", false,
                    status, elapsed, cleanMsg
            );
        } finally {
            if (tempDir != null) {
                deleteRecursivelyQuietly(tempDir);
            }
        }
    }

    private static volatile String cachedCCompilerPath = null;

    private String findCCompiler() {
        if (cachedCCompilerPath != null && new File(cachedCCompilerPath).exists()) {
            return cachedCCompilerPath;
        }

        // 1. Direct command names if in PATH
        for (String cmd : List.of("gcc", "clang", "cc")) {
            try {
                Process p = new ProcessBuilder(cmd, "--version").start();
                if (p.waitFor(1, TimeUnit.SECONDS) && p.exitValue() == 0) {
                    cachedCCompilerPath = cmd;
                    return cmd;
                }
            } catch (Exception ignored) {
            }
        }

        // 2. Scan standard WinGet / MinGW / LLVM install paths
        List<String> directPaths = new ArrayList<>();
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null) {
            directPaths.add(localAppData + "\\Microsoft\\WinGet\\Packages\\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\llvm-mingw-20260616-ucrt-x86_64\\bin\\gcc.exe");
            directPaths.add(localAppData + "\\Microsoft\\WinGet\\Packages\\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\llvm-mingw-20260616-ucrt-x86_64\\bin\\clang.exe");
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
                return cachedCCompilerPath;
            }
        }

        // 3. Dynamic search in WinGet Packages directory
        if (localAppData != null) {
            File wingetDir = new File(localAppData + "\\Microsoft\\WinGet\\Packages");
            if (wingetDir.exists() && wingetDir.isDirectory()) {
                try (var stream = Files.walk(wingetDir.toPath(), 6)) {
                    Optional<Path> found = stream
                            .filter(p -> p.getFileName().toString().equalsIgnoreCase("gcc.exe") ||
                                         p.getFileName().toString().equalsIgnoreCase("clang.exe"))
                            .findFirst();
                    if (found.isPresent()) {
                        cachedCCompilerPath = found.get().toAbsolutePath().toString();
                        return cachedCCompilerPath;
                    }
                } catch (Exception ignored) {
                }
            }
        }

        return null;
    }

    private List<String> buildCommand(String language, String code, Path dir) throws IOException {
        switch (language) {
            case "c":
            case "gcc":
            case "clang": {
                Path sourceFile = dir.resolve("solution.c");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);
                boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
                Path exeFile = dir.resolve(isWindows ? "solution.exe" : "solution");

                String compiler = findCCompiler();
                if (compiler == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "C compiler (GCC / Clang) is not available on the server host. Please contact admin or use Python / Java.");
                }

                ProcessBuilder compilePb = new ProcessBuilder(
                        compiler, "-O2", sourceFile.toAbsolutePath().toString(), "-o", exeFile.toAbsolutePath().toString()
                );
                compilePb.directory(dir.toFile());
                Process compileProc = compilePb.start();
                Future<String> compileErr = captureStreamAsync(compileProc.getErrorStream());
                try {
                    boolean compiled = compileProc.waitFor(10, TimeUnit.SECONDS);
                    if (!compiled || compileProc.exitValue() != 0) {
                        String err = compileErr.get(2, TimeUnit.SECONDS);
                        throw new RuntimeException("COMPILATION_ERROR: " + (!err.isBlank() ? err.trim() : "C compilation failed"));
                    }
                } catch (InterruptedException | ExecutionException | TimeoutException e) {
                    throw new RuntimeException("COMPILATION_ERROR: " + e.getMessage());
                }

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
                Path file = dir.resolve("Solution.java");
                Files.writeString(file, code, StandardCharsets.UTF_8);
                return List.of("java", file.toAbsolutePath().toString());
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
