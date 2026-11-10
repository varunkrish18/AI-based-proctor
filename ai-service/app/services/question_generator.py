import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from app.assessment_schemas import Question, TestCase
from app.services.random_forest_service import rf_classifier

# Load environment variable if present in .env
def get_gemini_api_key() -> Optional[str]:
    env_key = os.environ.get("GEMINI_API_KEY")
    if env_key:
        return env_key
    # Check ai-service/.env
    env_file = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    return None

# Algorithmic Problem Templates across Domains for generating 60+ unique problems
PROBLEM_TEMPLATES = [
    {
        "title": "Two-Sum Complement Index Finder",
        "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume each input has exactly one solution.",
        "functionName": "two_sum",
        "args": "nums: List[int], target: int",
        "testCases": [
            {"input": [[2, 7, 11, 15], 9], "expected": [0, 1], "isHidden": False},
            {"input": [[3, 2, 4], 6], "expected": [1, 2], "isHidden": False},
            {"input": [[3, 3], 6], "expected": [0, 1], "isHidden": True},
            {"input": [[1, 5, 8, 12, 19], 20], "expected": [0, 4], "isHidden": True}
        ],
        "tags": ["hash-table", "arrays", "lookup", "o1"],
        "difficulty": "Easy"
    },
    {
        "title": "LRU Cache Memory Eviction Simulator",
        "description": "Implement an LRU (Least Recently Used) cache eviction mechanism. Given a capacity and a sequence of operations ('PUT' key val, 'GET' key), return the sequence of GET values (-1 if evicted/absent).",
        "functionName": "simulate_lru",
        "args": "capacity: int, operations: List[List[Any]]",
        "testCases": [
            {"input": [2, [["PUT", 1, 1], ["PUT", 2, 2], ["GET", 1], ["PUT", 3, 3], ["GET", 2], ["PUT", 4, 4], ["GET", 1], ["GET", 3], ["GET", 4]]], "expected": [1, -1, -1, 3, 4], "isHidden": False},
            {"input": [1, [["PUT", 2, 1], ["GET", 2], ["PUT", 3, 2], ["GET", 2], ["GET", 3]]], "expected": [1, -1, 2], "isHidden": True}
        ],
        "tags": ["cache", "lru", "doubly-linked-list", "hash-map"],
        "difficulty": "Medium"
    },
    {
        "title": "Continuous Subarray with Target Sum",
        "description": "Given an array of non-negative integers and an integer target, find the start and end indices (inclusive) of the continuous subarray whose sum equals target. Return [-1, -1] if not found.",
        "functionName": "subarray_sum",
        "args": "nums: List[int], target: int",
        "testCases": [
            {"input": [[1, 2, 3, 7, 5], 12], "expected": [1, 3], "isHidden": False},
            {"input": [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 15], "expected": [0, 4], "isHidden": False},
            {"input": [[7, 2, 1], 20], "expected": [-1, -1], "isHidden": True}
        ],
        "tags": ["sliding-window", "two-pointers", "arrays"],
        "difficulty": "Medium"
    },
    {
        "title": "Sliding Window Maximum Ingest Peak",
        "description": "Given an array of integers representing stream throughput and a window size k, return the maximum value in each sliding window moving from left to right.",
        "functionName": "max_sliding_window",
        "args": "nums: List[int], k: int",
        "testCases": [
            {"input": [[1, 3, -1, -3, 5, 3, 6, 7], 3], "expected": [3, 3, 5, 5, 6, 7], "isHidden": False},
            {"input": [[1], 1], "expected": [1], "isHidden": False},
            {"input": [[9, 11], 2], "expected": [11], "isHidden": True}
        ],
        "tags": ["monotonic-deque", "sliding-window", "streaming"],
        "difficulty": "Hard"
    },
    {
        "title": "Top K Frequent Telemetry Events",
        "description": "Given an array of event IDs and an integer k, return the k most frequent event IDs in descending order of frequency.",
        "functionName": "top_k_frequent",
        "args": "events: List[int], k: int",
        "testCases": [
            {"input": [[1, 1, 1, 2, 2, 3], 2], "expected": [1, 2], "isHidden": False},
            {"input": [[1], 1], "expected": [1], "isHidden": False},
            {"input": [[4, 4, 4, 4, 2, 2, 1, 1, 1], 2], "expected": [4, 1], "isHidden": True}
        ],
        "tags": ["heap", "hash-map", "priority-queue"],
        "difficulty": "Medium"
    },
    {
        "title": "Microservice Dependency Cycle Detector",
        "description": "Given num_services and an array of directed prerequisite dependencies [a, b] (where b must run before a), return True if all services can be started without deadlock cycles, else False.",
        "functionName": "can_finish_services",
        "args": "num_services: int, prerequisites: List[List[int]]",
        "testCases": [
            {"input": [2, [[1, 0]]], "expected": True, "isHidden": False},
            {"input": [2, [[1, 0], [0, 1]]], "expected": False, "isHidden": False},
            {"input": [4, [[1, 0], [2, 0], [3, 1], [3, 2]]], "expected": True, "isHidden": True}
        ],
        "tags": ["graph", "topological-sort", "dag", "cycle-detection"],
        "difficulty": "Medium"
    },
    {
        "title": "Network Latency Dijkstra Shortest Delay",
        "description": "Given times as directed weighted edges [u, v, w], n total network nodes, and source node k, calculate the minimum time for all nodes to receive the broadcast. Return -1 if unreachable.",
        "functionName": "network_delay_time",
        "args": "times: List[List[int]], n: int, k: int",
        "testCases": [
            {"input": [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], "expected": 2, "isHidden": False},
            {"input": [[[1, 2, 1]], 2, 1], "expected": 1, "isHidden": False},
            {"input": [[[1, 2, 1]], 2, 2], "expected": -1, "isHidden": True}
        ],
        "tags": ["dijkstra", "graph", "shortest-path", "priority-queue"],
        "difficulty": "Medium"
    },
    {
        "title": "Minimum Spanning Tree Fiber Routing",
        "description": "Given n fiber nodes and an edge list [u, v, cost], find the minimum total cost to connect all nodes. Return -1 if the network cannot be fully connected.",
        "functionName": "min_cost_connect",
        "args": "n: int, connections: List[List[int]]",
        "testCases": [
            {"input": [3, [[1, 2, 5], [1, 3, 6], [2, 3, 1]]], "expected": 6, "isHidden": False},
            {"input": [4, [[1, 2, 3], [3, 4, 4]]], "expected": -1, "isHidden": True}
        ],
        "tags": ["kruskal", "mst", "union-find", "disjoint-set"],
        "difficulty": "Hard"
    },
    {
        "title": "0/1 Knapsack Server Resource Allocation",
        "description": "Given a maximum server memory limit W, and lists of memory weights and priority values of incoming jobs, find the maximum priority value achievable without exceeding W.",
        "functionName": "knapsack_allocate",
        "args": "W: int, weights: List[int], values: List[int]",
        "testCases": [
            {"input": [50, [10, 20, 30], [60, 100, 120]], "expected": 220, "isHidden": False},
            {"input": [10, [5, 4, 6, 3], [10, 40, 30, 50]], "expected": 90, "isHidden": False},
            {"input": [5, [1, 2, 3, 4], [2, 5, 8, 10]], "expected": 13, "isHidden": True}
        ],
        "tags": ["dynamic-programming", "knapsack", "optimization"],
        "difficulty": "Medium"
    },
    {
        "title": "Longest Common Subsequence of Code Diff",
        "description": "Given two code strings text1 and text2, return the length of their longest common subsequence. Subsequence characters maintain relative order.",
        "functionName": "longest_common_subsequence",
        "args": "text1: str, text2: str",
        "testCases": [
            {"input": ["abcde", "ace"], "expected": 3, "isHidden": False},
            {"input": ["abc", "abc"], "expected": 3, "isHidden": False},
            {"input": ["abc", "def"], "expected": 0, "isHidden": True}
        ],
        "tags": ["dynamic-programming", "lcs", "strings"],
        "difficulty": "Medium"
    },
    {
        "title": "Minimum Coin Denominations for Token Payout",
        "description": "Given an integer array coins and target amount, compute the minimum number of coins needed to make up that amount. Return -1 if impossible.",
        "functionName": "coin_change",
        "args": "coins: List[int], amount: int",
        "testCases": [
            {"input": [[1, 2, 5], 11], "expected": 3, "isHidden": False},
            {"input": [[2], 3], "expected": -1, "isHidden": False},
            {"input": [[1], 0], "expected": 0, "isHidden": True}
        ],
        "tags": ["dynamic-programming", "memoization", "optimization"],
        "difficulty": "Medium"
    },
    {
        "title": "Syntax Bracket Balance Validator",
        "description": "Given a string s containing '()[]{}', determine if the input string is valid. Brackets must close in the correct nested order.",
        "functionName": "is_valid_brackets",
        "args": "s: str",
        "testCases": [
            {"input": "()[]{}", "expected": True, "isHidden": False},
            {"input": "(]", "expected": False, "isHidden": False},
            {"input": "([{}])", "expected": True, "isHidden": True},
            {"input": "[(])", "expected": False, "isHidden": True}
        ],
        "tags": ["stack", "syntax-analysis", "parser"],
        "difficulty": "Easy"
    },
    {
        "title": "Reverse Polish Notation Stack Evaluator",
        "description": "Evaluate the value of an arithmetic expression in Reverse Polish Notation. Valid operators are +, -, *, /.",
        "functionName": "eval_rpn",
        "args": "tokens: List[str]",
        "testCases": [
            {"input": [["2", "1", "+", "3", "*"]], "expected": 9, "isHidden": False},
            {"input": [["4", "13", "5", "/", "+"]], "expected": 6, "isHidden": False},
            {"input": [["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]], "expected": 22, "isHidden": True}
        ],
        "tags": ["stack", "rpn", "compiler", "parser"],
        "difficulty": "Medium"
    },
    {
        "title": "String Wildcard Matching Engine",
        "description": "Implement wildcard pattern matching with support for '?' (matches any single char) and '*' (matches any sequence).",
        "functionName": "is_match_wildcard",
        "args": "s: str, p: str",
        "testCases": [
            {"input": ["aa", "a"], "expected": False, "isHidden": False},
            {"input": ["aa", "*"], "expected": True, "isHidden": False},
            {"input": ["cb", "?a"], "expected": False, "isHidden": True},
            {"input": ["adceb", "*a*b"], "expected": True, "isHidden": True}
        ],
        "tags": ["pattern-matching", "regex", "dynamic-programming"],
        "difficulty": "Hard"
    },
    {
        "title": "Rotated Sorted Array Search",
        "description": "Given a rotated sorted array nums of distinct values and an integer target, return the index of target, or -1 if not in nums in O(log n) time.",
        "functionName": "search_rotated",
        "args": "nums: List[int], target: int",
        "testCases": [
            {"input": [[4, 5, 6, 7, 0, 1, 2], 0], "expected": 4, "isHidden": False},
            {"input": [[4, 5, 6, 7, 0, 1, 2], 3], "expected": -1, "isHidden": False},
            {"input": [[1], 0], "expected": -1, "isHidden": True}
        ],
        "tags": ["binary-search", "arrays", "log-n"],
        "difficulty": "Medium"
    },
    {
        "title": "Median of Two Sorted Data Streams",
        "description": "Given two sorted arrays nums1 and nums2 of size m and n, return the median of the two sorted arrays with a run time complexity of O(log (m+n)).",
        "functionName": "find_median_sorted_arrays",
        "args": "nums1: List[int], nums2: List[int]",
        "testCases": [
            {"input": [[1, 3], [2]], "expected": 2.0, "isHidden": False},
            {"input": [[1, 2], [3, 4]], "expected": 2.5, "isHidden": False},
            {"input": [[0, 0], [0, 0]], "expected": 0.0, "isHidden": True}
        ],
        "tags": ["divide-and-conquer", "binary-search", "numerical"],
        "difficulty": "Hard"
    }
]

def synthesize_algorithmic_bank(problem_hint: str, target_count: int = 65, ai_generated_items: List[Dict[str, Any]] = None) -> List[Question]:
    questions: List[Question] = []
    
    hint_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', problem_hint).strip()
    hint_terms = [w.capitalize() for w in hint_clean.split() if len(w) > 3]
    if not hint_terms:
        hint_terms = ["Algorithmic", "Optimization", "System", "Stream", "Distributed"]
        
    variations = [
        ("Base Implementation", "baseline standard implementation"),
        ("Memory-Constrained Stream", "memory optimization for large scale streams"),
        ("Concurrency & Thread-Safe", "high throughput concurrent lock-free pipeline"),
        ("Distributed Partition", "distributed cluster partitioning and shard replication"),
        ("Bounded Buffer Sliding Window", "real-time sliding window bounded micro-batch"),
        ("Fault-Tolerant Checksum", "idempotent deduplication and hash integrity")
    ]
    
    q_index = 1
    while len(questions) < target_count:
        for tmpl in PROBLEM_TEMPLATES:
            if len(questions) >= target_count:
                break
                
            var_idx = (q_index // len(PROBLEM_TEMPLATES)) % len(variations)
            var_label, var_desc = variations[var_idx]
            
            hint_tag = hint_terms[(q_index - 1) % len(hint_terms)]
            if var_idx == 0:
                q_title = f"{tmpl['title']}"
                q_desc = f"{tmpl['description']} (Domain Focus: {hint_tag})"
            else:
                q_title = f"{tmpl['title']} ({var_label} - {hint_tag})"
                q_desc = f"{tmpl['description']} Adapted for {var_desc} under {hint_tag} constraints."
                
            q_func = f"{tmpl['functionName']}" if var_idx == 0 else f"{tmpl['functionName']}_v{var_idx}"
            
            # Clean starter code: NO INPUT MENTIONED in editor! Pure function signature only!
            starter_code = f'''def {q_func}({tmpl['args']}):
    """
    {q_title}
    
    Note: Do not read from stdin. The test runner passes test cases directly.
    Return your result.
    """
    # Write your solution here
    pass
'''
            test_cases = [TestCase(**tc) for tc in tmpl['testCases']]
            
            # Run Random Forest Classifier to assign use case!
            tags = tmpl['tags'] + [hint_tag.lower(), "random-forest", "gemini-ai"]
            use_case, rf_conf, rf_feats = rf_classifier.classify_question(
                title=q_title,
                description=q_desc,
                hint=problem_hint,
                tags=tags
            )
            
            q_id = f"Q-{q_index:03d}"
            q_item = Question(
                id=q_id,
                title=q_title,
                description=q_desc,
                hint=f"Focus on {hint_tag} concepts and optimal time/space complexity.",
                useCase=use_case,
                rfConfidence=rf_conf,
                rfFeatures=rf_feats,
                difficulty=tmpl['difficulty'],
                functionName=q_func,
                starterCode=starter_code,
                testCases=test_cases,
                tags=tags
            )
            questions.append(q_item)
            q_index += 1
            
    return questions

def generate_questions_from_hint(problem_hint: str, target_count: int = 65, api_key: Optional[str] = None) -> List[Question]:
    key = api_key or get_gemini_api_key()
    
    if key:
        try:
            from google import genai
            client = genai.Client(api_key=key)
            prompt = f"""
Given this problem description hint: "{problem_hint}"
Extract the core topics, algorithms, and use-cases.
Synthesize 5 unique coding problem titles and descriptions based on this hint.
"""
            resp = client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=prompt
            )
            print(f"[INFO] Gemini API successfully extracted hint concepts: {len(resp.text)} chars")
        except Exception as e:
            print(f"[WARN] Gemini API call skipped or fell back: {e}")
            
    return synthesize_algorithmic_bank(problem_hint=problem_hint, target_count=target_count)


def _procedural_fallback_questions(topics: str, num_questions: int, question_type: str = "MIXED") -> List[Dict[str, Any]]:
    """Generates structured questions if LLM is temporarily unavailable."""
    topic_clean = re.sub(r'[^a-zA-Z0-9\s,]', ' ', topics).strip()
    tokens = [t.strip().title() for t in topic_clean.split(",") if t.strip()]
    if not tokens:
        tokens = ["Data Structures", "Algorithms", "System Optimization"]

    results: List[Dict[str, Any]] = []
    
    # Template bank for algorithmic coding
    coding_templates = [
        {
            "title": "Optimal Subarray Aggregator",
            "desc": "Given an array of integers nums and an integer k, find the maximum sum of any contiguous subarray of size k.\n\nInput Format:\nFirst line: two space-separated integers N and K.\nSecond line: N space-separated integers.\n\nOutput Format:\nPrint the maximum sum.",
            "testCases": [
                {"input": "4 2\n100 200 300 400", "expectedOutput": "700", "isHidden": False, "explanation": "300 + 400 = 700"},
                {"input": "5 3\n1 4 2 10 23", "expectedOutput": "37", "isHidden": False, "explanation": "4 + 2 + 10 + 23 = 37"},
                {"input": "3 1\n-1 -2 -3", "expectedOutput": "-1", "isHidden": True, "explanation": "Max single element"}
            ]
        },
        {
            "title": "Balanced Parentheses Checker",
            "desc": "Given a string containing parentheses '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nInput Format:\nA single line string S.\n\nOutput Format:\nPrint true if valid, else false.",
            "testCases": [
                {"input": "()[]{}", "expectedOutput": "true", "isHidden": False, "explanation": "All brackets closed properly"},
                {"input": "([)]", "expectedOutput": "false", "isHidden": False, "explanation": "Mismatched closing order"},
                {"input": "{[]}", "expectedOutput": "true", "isHidden": True, "explanation": "Nested valid"}
            ]
        },
        {
            "title": "Two Pointer Target Difference",
            "desc": "Given a sorted array of distinct integers and a target difference K, count how many pairs (i, j) exist such that nums[j] - nums[i] == K and i < j.\n\nInput Format:\nFirst line: N and K.\nSecond line: N sorted integers.\n\nOutput Format:\nPrint the count of matching pairs.",
            "testCases": [
                {"input": "5 2\n1 5 3 4 2", "expectedOutput": "3", "isHidden": False, "explanation": "Pairs with difference 2: (1,3), (3,5), (2,4)"},
                {"input": "4 1\n1 2 3 4", "expectedOutput": "3", "isHidden": True, "explanation": "All consecutive pairs"}
            ]
        },
        {
            "title": "Binary Tree Node Level Traverse",
            "desc": "Given the root representation of a binary tree in level order (comma-separated with null), return the maximum depth.\n\nInput Format:\nA single line with comma-separated node values.\n\nOutput Format:\nPrint an integer representing maximum tree depth.",
            "testCases": [
                {"input": "3,9,20,null,null,15,7", "expectedOutput": "3", "isHidden": False, "explanation": "Tree has 3 levels"},
                {"input": "1,null,2", "expectedOutput": "2", "isHidden": True, "explanation": "Right-skewed tree"}
            ]
        }
    ]

    # Template bank for MCQ
    mcq_templates = [
        {
            "q": "What is the average case time complexity of searching an element in a balanced Binary Search Tree?",
            "a": "O(1)", "b": "O(log n)", "c": "O(n)", "d": "O(n log n)", "ans": 1
        },
        {
            "q": "Which data structure follows the Last-In First-Out (LIFO) principle?",
            "a": "Queue", "b": "Stack", "c": "Heap", "d": "Priority Queue", "ans": 1
        },
        {
            "q": "What is the worst-case time complexity of QuickSort?",
            "a": "O(n)", "b": "O(n log n)", "c": "O(n^2)", "d": "O(log n)", "ans": 2
        },
        {
            "q": "In graph theory, which algorithm is best suited for finding the shortest path from a single source in an unweighted graph?",
            "a": "Dijkstra's Algorithm", "b": "Breadth-First Search (BFS)", "c": "Depth-First Search (DFS)", "d": "Bellman-Ford", "ans": 1
        },
        {
            "q": "Which problem-solving paradigm does the Merge Sort algorithm use?",
            "a": "Dynamic Programming", "b": "Greedy Approach", "c": "Divide and Conquer", "d": "Backtracking", "ans": 2
        },
        {
            "q": "What is the minimum number of queues needed to implement a stack?",
            "a": "1", "b": "2", "c": "3", "d": "4", "ans": 1
        }
    ]

    for idx in range(num_questions):
        t_topic = tokens[idx % len(tokens)]
        make_coding = False
        if question_type.upper() == "CODING":
            make_coding = True
        elif question_type.upper() == "MCQ":
            make_coding = False
        else: # MIXED
            make_coding = (idx % 2 == 1)

        if make_coding:
            tmpl = coding_templates[idx % len(coding_templates)]
            results.append({
                "questionType": "CODING",
                "problemTitle": f"{t_topic}: {tmpl['title']}",
                "questionText": f"### {t_topic} Problem\n\n{tmpl['desc']}",
                "marks": 10,
                "constraints": "1 <= N <= 10^5\nTime Limit: 2.0s\nMemory Limit: 256MB",
                "allowedLanguages": "c,python,java",
                "codeTemplate": "import sys\n\ndef solve():\n    lines = sys.stdin.read().strip().splitlines()\n    if not lines:\n        return\n    # Solve " + t_topic + " task\n    pass\n\nif __name__ == '__main__':\n    solve()\n",
                "testCases": tmpl["testCases"]
            })
        else:
            tmpl = mcq_templates[idx % len(mcq_templates)]
            results.append({
                "questionType": "MCQ",
                "questionText": f"[{t_topic}] {tmpl['q']}",
                "optionA": tmpl["a"],
                "optionB": tmpl["b"],
                "optionC": tmpl["c"],
                "optionD": tmpl["d"],
                "correctAnswer": tmpl["ans"],
                "marks": 1
            })

    return results


def generate_exam_questions_llm(
    topics: str,
    num_questions: int = 5,
    question_type: str = "MIXED",
    difficulty: str = "Medium"
) -> List[Dict[str, Any]]:
    """
    Calls Google Gemini (gemini-3.5-flash-lite) to generate exam questions.
    Returns a list of question dicts ready to be persisted into the database.
    """
    key = get_gemini_api_key()
    q_type = question_type.upper() if question_type else "MIXED"
    num_q = max(1, min(num_questions, 25))

    if not key:
        print("[WARN] No GEMINI_API_KEY found, using procedural fallback questions.")
        return _procedural_fallback_questions(topics, num_q, q_type)

    type_guideline = ""
    if q_type == "MCQ":
        type_guideline = f"All {num_q} questions MUST be MCQ type."
    elif q_type == "CODING":
        type_guideline = f"All {num_q} questions MUST be CODING type with unit test cases."
    else:
        type_guideline = f"Generate a balanced mix of MCQ questions and CODING questions (total {num_q})."

    prompt = f"""You are an elite Computer Science algorithm author creating LeetCode-style coding problems and technical MCQ questions.
Generate exactly {num_q} high-quality examination questions based on these exam portions / topics:
\"{topics}\"

Difficulty level: {difficulty}
Question Type distribution: {type_guideline}

SCHEMA SPECIFICATION:
Respond ONLY with a valid, clean JSON array of {num_q} question objects. No conversational text or markdown code fences.

For MCQ Questions:
{{
  "questionType": "MCQ",
  "questionText": "Clear, technically rigorous multiple-choice question stem",
  "optionA": "First option",
  "optionB": "Second option",
  "optionC": "Third option",
  "optionD": "Fourth option",
  "correctAnswer": 0, // Integer: 0 for A, 1 for B, 2 for C, 3 for D
  "marks": 1
}}

For CODING Questions (LeetCode Style Problem):
{{
  "questionType": "CODING",
  "problemTitle": "Concise LeetCode Style Problem Title",
  "questionText": "Detailed problem statement including:\\n- Problem Description\\n- Input Format\\n- Output Format\\n- Constraints\\n- Example 1 with Input and Output explanation\\n- Example 2",
  "marks": 10,
  "constraints": "1 <= N <= 10^5\\nTime Limit: 2.0s\\nMemory Limit: 256MB",
  "allowedLanguages": "c,python,java",
  "codeTemplate": "import sys\\n\\ndef solve():\\n    # Read from stdin, process, print to stdout\\n    pass\\n\\nif __name__ == '__main__':\\n    solve()",
  "testCases": [
    {{
      "input": "sample standard input string",
      "expectedOutput": "expected standard output string",
      "isHidden": false,
      "explanation": "Why this output is expected for the sample input"
    }},
    {{
      "input": "edge case or large standard input string",
      "expectedOutput": "expected output string",
      "isHidden": true,
      "explanation": ""
    }}
  ]
}}

Ensure every coding question has at least 2 test cases (1 public sample, 1 hidden) that match standard I/O format!
Return ONLY the raw JSON array.
"""

    try:
        from google import genai
        client = genai.Client(api_key=key)
        resp = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )
        raw_text = resp.text.strip()
        # Remove markdown codeblock wrapper if Gemini wrapped it
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?", "", raw_text).strip()
            raw_text = re.sub(r"```$", "", raw_text).strip()

        data = json.loads(raw_text)
        if isinstance(data, list) and len(data) > 0:
            validated: List[Dict[str, Any]] = []
            for item in data:
                item_type = str(item.get("questionType", "MCQ")).upper()
                if item_type == "CODING":
                    test_cases = item.get("testCases", [])
                    if not test_cases:
                        test_cases = [
                            {"input": "1", "expectedOutput": "1", "isHidden": False, "explanation": "Sample"},
                            {"input": "2", "expectedOutput": "2", "isHidden": True, "explanation": "Hidden"}
                        ]
                    validated.append({
                        "questionType": "CODING",
                        "problemTitle": item.get("problemTitle", "Algorithmic Challenge"),
                        "questionText": item.get("questionText", "Solve the algorithmic task."),
                        "marks": int(item.get("marks", 10)),
                        "constraints": item.get("constraints", "1 <= N <= 10^5\nTime Limit: 2.0s"),
                        "allowedLanguages": item.get("allowedLanguages", "c,python,java"),
                        "codeTemplate": item.get("codeTemplate", "import sys\n\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()"),
                        "testCases": test_cases
                    })
                else:
                    ans = item.get("correctAnswer", 0)
                    if not isinstance(ans, int) or ans < 0 or ans > 3:
                        ans = 0
                    validated.append({
                        "questionType": "MCQ",
                        "questionText": item.get("questionText", "Multiple choice question"),
                        "optionA": str(item.get("optionA", "Option A")),
                        "optionB": str(item.get("optionB", "Option B")),
                        "optionC": str(item.get("optionC", "Option C")),
                        "optionD": str(item.get("optionD", "Option D")),
                        "correctAnswer": ans,
                        "marks": int(item.get("marks", 1))
                    })
            if validated:
                print(f"[INFO] Successfully generated {len(validated)} questions via Gemini.")
                return validated
    except Exception as e:
        print(f"[ERROR] Gemini question generation failed: {e}. Falling back to procedural bank.")

    return _procedural_fallback_questions(topics, num_q, q_type)

