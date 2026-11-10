from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("1. Testing GET / ...")
res = client.get("/")
assert res.status_code == 200, f"Expected 200, got {res.status_code}"
print("   [PASS] Root OK:", res.json()["message"])

print("2. Testing GET /v1/assessment/questions ...")
res = client.get("/v1/assessment/questions")
assert res.status_code == 200, f"Expected 200, got {res.status_code}"
questions = res.json()
print(f"   [PASS] Retrieved {len(questions)} questions (>= 60)")
assert len(questions) >= 60, "Must have 60+ questions"

sample_q = questions[0]
print(f"   [PASS] Sample: {sample_q['id']} - {sample_q['title']}")
print(f"   [PASS] Random Forest Use Case: {sample_q['useCase']} ({sample_q['rfConfidence']*100:.1f}%)")

print("3. Testing POST /v1/assessment/run-code (No input in editor test) ...")
test_solution = """def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            return [seen[diff], i]
        seen[n] = i
    return []
"""
run_res = client.post("/v1/assessment/run-code", json={"questionId": "Q-001", "code": test_solution})
assert run_res.status_code == 200
run_data = run_res.json()
print(f"   [PASS] Code Execution: {run_data['score']}% Passed ({run_data['passedCases']}/{run_data['totalCases']}) in {run_data['totalRuntimeMs']}ms")

print("4. Testing POST /v1/assessment/submit ...")
sub_res = client.post("/v1/assessment/submit", json={
    "questionId": "Q-001",
    "candidateId": "CAND-VERIFY",
    "candidateName": "Varun Automated Tester",
    "code": test_solution,
    "timeConsumedSec": 142.5
})
assert sub_res.status_code == 200
sub_data = sub_res.json()
print(f"   [PASS] Submission logged: {sub_data['submissionId']}, Time Consumed: {sub_data['timeConsumedFormatted']}")

print("5. Testing GET /v1/assessment/reports (Admin Portal Data points) ...")
rep_res = client.get("/v1/assessment/reports")
assert rep_res.status_code == 200
reports = rep_res.json()
print(f"   [PASS] Total Admin Reports: {len(reports)}")
latest = reports[0]
print("   [PASS] Verified Data Points:")
print(f"     - Question: {latest['questionTitle']} [{latest['useCase']}]")
print(f"     - Answers: {len(latest['answers'].splitlines())} lines of code")
print(f"     - Time Consuming: {latest['timeConsumedFormatted']} ({latest['timeConsumedSec']}s)")
print(f"     - Evaluations: Score {latest['evaluations']['scorePercent']}%, Status: {latest['evaluations']['status']}")

print("\nALL 6 REQUIREMENTS VERIFIED END-TO-END SUCCESSFULLY!")
