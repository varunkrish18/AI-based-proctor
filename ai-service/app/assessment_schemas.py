from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class TestCase(BaseModel):
    input: Any = Field(..., description="Arguments passed to the solution function")
    expected: Any = Field(..., description="Expected return value")
    isHidden: bool = Field(default=False, description="Whether test case is hidden from the candidate")

class Question(BaseModel):
    id: str
    title: str
    description: str
    hint: str
    useCase: str = Field(default="Algorithms & Optimization", description="Assigned by Random Forest Classifier")
    rfConfidence: float = Field(default=0.92, description="Random Forest classification confidence")
    rfFeatures: Optional[Dict[str, float]] = None
    difficulty: str = Field(default="Medium")
    functionName: str
    starterCode: str
    testCases: List[TestCase]
    tags: List[str] = Field(default_factory=list)

class GenerateQuestionsRequest(BaseModel):
    problemHint: str = Field(..., description="Problem description hint or topic concept")
    count: int = Field(default=65, ge=10, le=100, description="Target question count (60+)")
    apiKey: Optional[str] = Field(default=None, description="Optional Gemini API key")

class RunCodeRequest(BaseModel):
    questionId: str
    code: str

class TestCaseResult(BaseModel):
    testIndex: int
    passed: bool
    actualOutput: Optional[Any] = None
    expectedOutput: Optional[Any] = None
    runtimeMs: float = 0.0
    error: Optional[str] = None
    isHidden: bool = False

class CodeExecutionResponse(BaseModel):
    success: bool
    totalCases: int
    passedCases: int
    failedCases: int
    score: float
    results: List[TestCaseResult]
    totalRuntimeMs: float
    compilationError: Optional[str] = None

class SubmitSolutionRequest(BaseModel):
    questionId: str
    candidateId: Optional[str] = "CAND-1001"
    candidateName: Optional[str] = "Varun K"
    code: str
    timeConsumedSec: float = Field(..., description="Time taken by user in seconds")

class AssessmentReportItem(BaseModel):
    submissionId: str
    submittedAt: str
    candidateId: str
    candidateName: str
    questionId: str
    questionTitle: str
    questionHint: str
    useCase: str
    difficulty: str
    answers: str
    timeConsumedSec: float
    timeConsumedFormatted: str
    evaluations: Dict[str, Any]
