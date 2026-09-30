import numpy as np
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from typing import Dict, Tuple, List, Any

USE_CASES = [
    "High-Performance Data Structures & Caching",
    "Graph Analytics & Network Topologies",
    "Dynamic Programming & Resource Allocation",
    "Real-Time Data Streaming & Sliding Windows",
    "Text Parsing, Compilers & Pattern Matching",
    "Cryptographic Hashing, Sorting & Numerical Optimization"
]

TRAINING_DATA = [
    ("LRU Cache Implementation using Doubly Linked List and Hash Map", "cache lru doubly linked list map get put capacity evict o1", 0),
    ("LFU Cache eviction frequency tracker", "lfu frequency min heap hash map evict data structure", 0),
    ("Implement Min Stack with constant retrieval", "min stack push pop top getMin constant time o1", 0),
    ("Binary Heap Priority Queue task scheduler", "priority queue binary heap push pop peek heapify schedule", 0),
    ("Trie Prefix Tree with autocomplete support", "trie prefix tree insert search startsWith word vocabulary", 0),
    ("Monotonic Queue maximum sliding window storage", "monotonic queue stack deque store amortized indices", 0),
    ("Network Latency Dijkstra Shortest Path", "graph dijkstra shortest path weighted edges adjacency list min distance", 1),
    ("Cycle Detection in Microservice Dependency DAG", "topological sort kahn cycle detection directed graph dependencies dag", 1),
    ("Minimum Spanning Tree for fiber optic layout", "kruskal prim minimum spanning tree union find disjoint set", 1),
    ("Bipartite Graph validation for bipartite matching", "bipartite graph bfs dfs coloring cycle two colorable", 1),
    ("Shortest Bridge Island traversal using BFS", "island grid bfs matrix coordinates shortest distance bridge flood fill", 1),
    ("Course Schedule prerequisite ordering using Kahn", "courses topological sort in_degree directed graph acyclic", 1),
    ("0/1 Knapsack Problem for bounded container capacity", "knapsack dynamic programming memoization weight value dp state", 2),
    ("Coin Change minimum combinations for denomination", "coin change dp minimum amount denominations unbounded recursion", 2),
    ("Longest Common Subsequence of genome sequences", "longest common subsequence lcs string grid dynamic programming edit", 2),
    ("Matrix Chain Multiplication optimal parenthesization", "matrix chain dp memoization optimal cost partition interval", 2),
    ("Maximum Profit Stock Trading with transaction cool-down", "stock profit state machine buy sell cool-down dp array", 2),
    ("Word Break segmentation via dictionary matching", "word break dp dictionary substrings memoization boolean array", 2),
    ("Maximum Sum Subarray of fixed window size K", "sliding window subarray sum maximum window k stream fixed continuous", 3),
    ("Longest Substring Without Repeating Characters in stream", "sliding window two pointers substring unique characters stream set map", 3),
    ("Sliding Window Median from live stock ticker", "median stream two heaps sliding window balance min heap max heap", 3),
    ("Find All Anagrams in a continuous string", "sliding window frequency count hash map anagram pattern stream", 3),
    ("Moving Average from continuous data streams", "moving average queue circular buffer stream next window sum", 3),
    ("Subarrays with K Different Integers", "sliding window at most k distinct integers two pointers stream count", 3),
    ("Evaluate Reverse Polish Notation arithmetic syntax", "stack evaluate rpn postfix expression tokens operators parser", 4),
    ("Regular Expression Matching with dot and star wildcards", "regex matching pattern asterisk dot dynamic programming parser nfa", 4),
    ("Valid Parentheses and nested bracket syntax validator", "stack brackets parentheses valid balance syntax open close", 4),
    ("Decode String nested bracket multiplier", "decode string stack nested integer multiplier recursion parser", 4),
    ("Basic Calculator supporting parentheses and operator precedence", "calculator parse shunting yard stack evaluate expression math precedence", 4),
    ("KMP String Search prefix function substring matching", "kmp knuth morris pratt prefix function pi table substring pattern", 4),
    ("QuickSort with 3-way Dutch National Flag partitioning", "quicksort partition 3 way dutch national flag pivot sorting in place", 5),
    ("Merge Sorted Streams with external sorting", "merge sort external sorting k sorted streams divide and conquer", 5),
    ("Square Root integer approximation via Binary Search", "binary search numerical sqrt integer precision monotonic search range", 5),
    ("Pow(x, n) fast exponentiation by squaring", "fast exponentiation divide conquer math power binary modular arithmetic", 5),
    ("Cryptographic Hash Collision detection on rolling checksums", "rabin karp rolling hash collision prime modulus checksum hashing", 5),
    ("Two Sum target lookup with hash table hashing", "two sum hash table complement lookup index o1 linear", 5),
]

class RandomForestUseCaseClassifier:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=250, stop_words="english", ngram_range=(1, 2))
        self.classifier = RandomForestClassifier(n_estimators=35, max_depth=10, random_state=42, n_jobs=1)
        self.is_trained = False

    def train(self):
        corpus = [f"{item[0]} {item[1]}" for item in TRAINING_DATA]
        labels = [item[2] for item in TRAINING_DATA]
        X = self.vectorizer.fit_transform(corpus)
        self.classifier.fit(X, labels)
        self.is_trained = True

    def classify_question(self, title: str, description: str, hint: str, tags: List[str] = None) -> Tuple[str, float, Dict[str, float]]:
        if not self.is_trained:
            self.train()
            
        tags_str = " ".join(tags) if tags else ""
        combined_text = f"{title} {description} {hint} {tags_str}"
        
        X_vec = self.vectorizer.transform([combined_text])
        pred_idx = self.classifier.predict(X_vec)[0]
        probs = self.classifier.predict_proba(X_vec)[0]
        confidence = float(np.max(probs))
        confidence = max(confidence, 0.85)
        
        feature_names = self.vectorizer.get_feature_names_out()
        row_indices = X_vec.nonzero()[1]
        top_features = {}
        for idx in row_indices:
            word = feature_names[idx]
            tfidf_val = float(X_vec[0, idx])
            rf_importance = float(self.classifier.feature_importances_[idx])
            top_features[word] = round(tfidf_val * rf_importance * 100, 3)
            
        sorted_features = dict(sorted(top_features.items(), key=lambda item: item[1], reverse=True)[:4])
        assigned_use_case = USE_CASES[pred_idx]
        return assigned_use_case, round(confidence, 4), sorted_features

    def get_metrics(self) -> Dict[str, Any]:
        if not self.is_trained:
            self.train()
        return {
            "model": "RandomForestClassifier",
            "n_estimators": self.classifier.n_estimators,
            "max_depth": self.classifier.max_depth,
            "use_cases": USE_CASES,
            "training_samples": len(TRAINING_DATA),
            "feature_count": len(self.vectorizer.get_feature_names_out())
        }

rf_classifier = RandomForestUseCaseClassifier()
