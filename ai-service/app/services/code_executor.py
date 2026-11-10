import sys
import time
import traceback
import copy
from typing import List, Dict, Any
from app.assessment_schemas import TestCase, TestCaseResult, CodeExecutionResponse

def run_isolated_test(func, test_input: Any, expected: Any, is_hidden: bool, test_index: int) -> TestCaseResult:
    start_t = time.perf_counter()
    try:
        # Prepare inputs: if list and function expects multiple args, handle properly
        call_input = copy.deepcopy(test_input)
        if isinstance(call_input, list):
            # Check if function takes 1 arg or multiple
            import inspect
            sig = inspect.signature(func)
            param_count = len(sig.parameters)
            if param_count > 1 and len(call_input) == param_count:
                actual = func(*call_input)
            else:
                actual = func(call_input)
        elif isinstance(call_input, dict):
            # Check if keyword args or single dict
            import inspect
            sig = inspect.signature(func)
            if len(sig.parameters) > 1:
                actual = func(**call_input)
            else:
                actual = func(call_input)
        else:
            actual = func(call_input)
            
        elapsed_ms = round((time.perf_counter() - start_t) * 1000.0, 3)
        
        # Deep compare actual vs expected
        passed = (actual == expected)
        
        return TestCaseResult(
            testIndex=test_index,
            passed=passed,
            actualOutput="[HIDDEN_TEST_CASE]" if is_hidden else actual,
            expectedOutput="[HIDDEN_TEST_CASE]" if is_hidden else expected,
            runtimeMs=elapsed_ms,
            error=None,
            isHidden=is_hidden
        )
    except Exception as e:
        elapsed_ms = round((time.perf_counter() - start_t) * 1000.0, 3)
        err_msg = f"{type(e).__name__}: {str(e)}"
        return TestCaseResult(
            testIndex=test_index,
            passed=False,
            actualOutput=None,
            expectedOutput="[HIDDEN_TEST_CASE]" if is_hidden else expected,
            runtimeMs=elapsed_ms,
            error=err_msg,
            isHidden=is_hidden
        )

def execute_code_submission(code: str, function_name: str, test_cases: List[TestCase]) -> CodeExecutionResponse:
    total_start = time.perf_counter()
    
    # 1. Compile candidate code in a clean execution environment
    exec_scope = {}
    # Safe globals builtins
    safe_globals = {
        "__builtins__": __builtins__,
        "List": List,
        "Dict": Dict,
        "Any": Any,
    }
    
    try:
        compiled = compile(code, "<candidate_submission>", "exec")
        exec(compiled, safe_globals, exec_scope)
    except Exception as e:
        total_runtime = round((time.perf_counter() - total_start) * 1000.0, 3)
        return CodeExecutionResponse(
            success=False,
            totalCases=len(test_cases),
            passedCases=0,
            failedCases=len(test_cases),
            score=0.0,
            results=[],
            totalRuntimeMs=total_runtime,
            compilationError=f"Syntax/Compilation Error: {type(e).__name__}: {str(e)}"
        )
        
    # 2. Locate the function
    func = exec_scope.get(function_name)
    if not func or not callable(func):
        # Fallback: search for any callable function defined in the code
        for k, v in exec_scope.items():
            if callable(v) and not k.startswith("__"):
                func = v
                break
                
    if not func:
        total_runtime = round((time.perf_counter() - total_start) * 1000.0, 3)
        return CodeExecutionResponse(
            success=False,
            totalCases=len(test_cases),
            passedCases=0,
            failedCases=len(test_cases),
            score=0.0,
            results=[],
            totalRuntimeMs=total_runtime,
            compilationError=f"Function '{function_name}' was not defined in the submitted solution."
        )
        
    # 3. Execute all test cases (public and hidden)
    results: List[TestCaseResult] = []
    passed_count = 0
    
    for idx, tc in enumerate(test_cases):
        res = run_isolated_test(
            func=func,
            test_input=tc.input,
            expected=tc.expected,
            is_hidden=tc.isHidden,
            test_index=idx + 1
        )
        if res.passed:
            passed_count += 1
        results.append(res)
        
    total_runtime = round((time.perf_counter() - total_start) * 1000.0, 3)
    score = round((passed_count / len(test_cases)) * 100.0, 1) if test_cases else 100.0
    
    return CodeExecutionResponse(
        success=(passed_count == len(test_cases)),
        totalCases=len(test_cases),
        passedCases=passed_count,
        failedCases=len(test_cases) - passed_count,
        score=score,
        results=results,
        totalRuntimeMs=total_runtime,
        compilationError=None
    )
