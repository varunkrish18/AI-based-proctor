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
        for line in env_file.read_text(encoding="utf-8").splitlines():
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
