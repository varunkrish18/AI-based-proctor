package com.proctor.exam.service;

import com.proctor.exam.dto.RunCodeResponse;
import com.proctor.exam.dto.TestCaseRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class CodeExecutionServiceTest {

    @Test
    public void testCExecution() {
        CodeExecutionService service = new CodeExecutionService(null, null);

        String cCode = """
            #include <stdio.h>
            int main() {
                int a, b;
                if (scanf("%d %d", &a, &b) == 2) {
                    printf("%d\\n", a + b);
                }
                return 0;
            }
            """;

        TestCaseRequest tc1 = new TestCaseRequest(null, "3 7", "10", false, "3 + 7 = 10", 0);
        TestCaseRequest tc2 = new TestCaseRequest(null, "10 -4", "6", false, "10 + (-4) = 6", 1);

        RunCodeResponse resp = service.testRun(List.of(tc1, tc2), cCode, "c");
        System.out.println("C Run Response Status: " + resp.status());
        System.out.println("Passed: " + resp.passedCases() + "/" + resp.totalCases());

        assertEquals("ACCEPTED", resp.status(), "C execution should produce ACCEPTED status");
        assertEquals(2, resp.passedCases());
    }
}
