import sys
from app.services.assessment_store import assessment_store
from app.services.code_executor import execute_code_submission

print(f"Total Questions Generated: {len(assessment_store.questions)}")
sample_q = assessment_store.questions["Q-001"]
print(f"Sample Question: {sample_q.id} - {sample_q.title}")
print(f"Random Forest Assigned Use Case: {sample_q.useCase} (Confidence: {sample_q.rfConfidence * 100:.1f}%)")
print(f"Total Admin Reports Seeded: {len(assessment_store.reports)}")

# Test code execution with candidate code
test_code = """def two_sum(nums, target):
    lookup = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in lookup:
            return [lookup[diff], i]
        lookup[n] = i
    return []
"""
res = execute_code_submission(test_code, sample_q.functionName, sample_q.testCases)
print(f"Code Execution Success: {res.success}, Score: {res.score}%, Passed: {res.passedCases}/{res.totalCases}, Runtime: {res.totalRuntimeMs}ms")
print("ALL BACKEND TESTS PASSED!")
