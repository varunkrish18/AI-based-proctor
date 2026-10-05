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
            tempDir = createExecutionTempDir();
            List<String> command = buildCommand(lang, code, tempDir);

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(tempDir.toFile());
            injectCompilerPath(pb);

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
                Path sourceFile = dir.resolve("solution.c");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);
                boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
                Path exeFile = dir.resolve(isWindows ? "solution.exe" : "solution");

                String compiler = findCCompiler();
                if (compiler == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "C compiler (GCC / Clang) is not available on the server host. Please contact admin or use Python / Java.");
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

                Process compileProc = compilePb.start();
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
                            throw new RuntimeException("COMPILATION_ERROR: " + (!rErr.isBlank() ? rErr.trim() : "C compilation failed"));
                        }
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
