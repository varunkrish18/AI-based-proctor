import datetime
from typing import Dict, List, Optional
from app.assessment_schemas import Question, AssessmentReportItem, SubmitSolutionRequest
from app.services.question_generator import generate_questions_from_hint
from app.services.code_executor import execute_code_submission

class AssessmentStore:
    def __init__(self):
        self.current_hint: str = "High-throughput data structures, graph cycle detection, sliding window streams, and dynamic programming optimization"
        self.questions: Dict[str, Question] = {}
        self.reports: List[AssessmentReportItem] = []
        self.initialize_store()

    def initialize_store(self):
        # Generate initial 65 questions based on hint
        q_list = generate_questions_from_hint(self.current_hint, target_count=65)
        for q in q_list:
            self.questions[q.id] = q
            
        # Seed realistic candidate submission reports
        sample_submissions = [
            {
                "subId": "SUB-9001",
                "candId": "CAND-102",
                "candName": "Varun K",
                "qId": "Q-001",
                "code": """def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []""",
                "timeSec": 164.2,
            },
            {
                "subId": "SUB-9002",
                "candId": "CAND-105",
                "candName": "Priya Sharma",
                "qId": "Q-006",
                "code": """def can_finish_services(num_services, prerequisites):
    from collections import deque
    adj = {i: [] for i in range(num_services)}
    in_degree = [0] * num_services
    for u, v in prerequisites:
        adj[v].append(u)
        in_degree[u] += 1
    queue = deque([i for i in range(num_services) if in_degree[i] == 0])
    visited = 0
    while queue:
        curr = queue.popleft()
        visited += 1
        for nxt in adj[curr]:
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                queue.append(nxt)
    return visited == num_services""",
                "timeSec": 312.0,
            },
            {
                "subId": "SUB-9003",
                "candId": "CAND-108",
                "candName": "Rahul Verma",
                "qId": "Q-009",
                "code": """def knapsack_allocate(W, weights, values):
    n = len(weights)
    dp = [0] * (W + 1)
    for i in range(n):
        for w in range(W, weights[i] - 1, -1):
            dp[w] = max(dp[w], dp[w - weights[i]] + values[i])
    return dp[W]""",
                "timeSec": 245.5,
            },
            {
                "subId": "SUB-9004",
                "candId": "CAND-114",
                "candName": "Ananya Patel",
                "qId": "Q-012",
                "code": """def is_valid_brackets(s):
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return len(stack) == 0""",
                "timeSec": 98.4,
            }
        ]
        
        for sample in sample_submissions:
            q = self.questions.get(sample["qId"])
            if q:
                exec_res = execute_code_submission(sample["code"], q.functionName, q.testCases)
                mins = int(sample["timeSec"] // 60)
                secs = int(sample["timeSec"] % 60)
                time_fmt = f"{mins}m {secs:02d}s"
                
                report = AssessmentReportItem(
                    submissionId=sample["subId"],
                    submittedAt="2026-09-30 09:30:00",
                    candidateId=sample["candId"],
                    candidateName=sample["candName"],
                    questionId=q.id,
                    questionTitle=q.title,
                    questionHint=q.hint,
                    useCase=q.useCase,
                    difficulty=q.difficulty,
                    answers=sample["code"],
                    timeConsumedSec=sample["timeSec"],
                    timeConsumedFormatted=time_fmt,
                    evaluations={
                        "scorePercent": exec_res.score,
                        "passedCases": exec_res.passedCases,
                        "totalCases": exec_res.totalCases,
                        "failedCases": exec_res.failedCases,
                        "totalRuntimeMs": exec_res.totalRuntimeMs,
                        "status": "PASSED" if exec_res.score == 100.0 else "PARTIAL",
                        "testResults": [r.dict() for r in exec_res.results],
                        "evalNotes": "Clean algorithm structure, correct parameter signature, no hardcoded inputs."
                    }
                )
                self.reports.append(report)

    def set_new_hint_and_generate(self, hint: str, count: int = 65, api_key: Optional[str] = None) -> List[Question]:
        self.current_hint = hint
        q_list = generate_questions_from_hint(hint, target_count=count, api_key=api_key)
        self.questions.clear()
        for q in q_list:
            self.questions[q.id] = q
        return q_list

    def add_submission(self, req: SubmitSolutionRequest) -> AssessmentReportItem:
        q = self.questions.get(req.questionId)
        if not q:
            raise ValueError(f"Question with ID {req.questionId} not found")
            
        exec_res = execute_code_submission(req.code, q.functionName, q.testCases)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        mins = int(req.timeConsumedSec // 60)
        secs = int(req.timeConsumedSec % 60)
        time_fmt = f"{mins}m {secs:02d}s"
        
        sub_id = f"SUB-{len(self.reports) + 9005}"
        report = AssessmentReportItem(
            submissionId=sub_id,
            submittedAt=now_str,
            candidateId=req.candidateId or "CAND-1001",
            candidateName=req.candidateName or "Candidate",
            questionId=q.id,
            questionTitle=q.title,
            questionHint=q.hint,
            useCase=q.useCase,
            difficulty=q.difficulty,
            answers=req.code,
            timeConsumedSec=req.timeConsumedSec,
            timeConsumedFormatted=time_fmt,
            evaluations={
                "scorePercent": exec_res.score,
                "passedCases": exec_res.passedCases,
                "totalCases": exec_res.totalCases,
                "failedCases": exec_res.failedCases,
                "totalRuntimeMs": exec_res.totalRuntimeMs,
                "status": "PASSED" if exec_res.score == 100.0 else "PARTIAL",
                "testResults": [r.dict() for r in exec_res.results],
                "evalNotes": "Evaluated against automated public and hidden test cases without editor inputs."
            }
        )
        self.reports.insert(0, report)
        return report

assessment_store = AssessmentStore()
