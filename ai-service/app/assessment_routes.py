from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.assessment_schemas import (
    Question, GenerateQuestionsRequest, RunCodeRequest, 
    CodeExecutionResponse, SubmitSolutionRequest, AssessmentReportItem
)
from app.services.assessment_store import assessment_store
from app.services.code_executor import execute_code_submission
from app.services.random_forest_service import rf_classifier
from app.services.question_generator import generate_exam_questions_llm

router = APIRouter(prefix="/v1/assessment", tags=["Coding Assessment Engine"])

class GenerateExamQuestionsPayload(BaseModel):
    topics: str = Field(..., description="Topics or portions of the exam")
    numQuestions: int = Field(default=5, ge=1, le=25, description="Number of questions to generate")
    questionType: str = Field(default="MIXED", description="MCQ, CODING, or MIXED")
    difficulty: str = Field(default="Medium", description="Easy, Medium, Hard, Balanced")

@router.post("/generate-exam-questions", response_model=List[Dict[str, Any]])
def generate_exam_questions_endpoint(req: GenerateExamQuestionsPayload):
    """
    Called by backend when admin or examiner requests AI-generated questions for an exam.
    Calls Google Gemini to generate MCQ or Coding questions with test cases.
    """
    if not req.topics or len(req.topics.strip()) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam portions / topics must be provided."
        )
    return generate_exam_questions_llm(
        topics=req.topics,
        num_questions=req.numQuestions,
        question_type=req.questionType,
        difficulty=req.difficulty
    )


@router.post("/generate", response_model=List[Question])
def generate_questions_api(req: GenerateQuestionsRequest):
    """
    1. Problem Description hint provided.
    2. Extract the hint and create 60+ unique questions using Gemini AI / algorithmic engine.
    3. Questions are assigned using Random Forest algorithm to core industry use-cases.
    """
    if not req.problemHint or len(req.problemHint.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Problem description hint must be at least 3 characters long."
        )
    target = max(60, req.count)
    questions = assessment_store.set_new_hint_and_generate(
        hint=req.problemHint,
        count=target,
        api_key=req.apiKey
    )
    return questions

@router.get("/questions", response_model=List[Question])
def list_questions(
    useCase: Optional[str] = Query(None, description="Filter by Random Forest use case"),
    difficulty: Optional[str] = Query(None, description="Filter by difficulty"),
    search: Optional[str] = Query(None, description="Search by title or keyword")
):
    """
    Retrieve current bank of generated questions with Random Forest use cases.
    """
    q_list = list(assessment_store.questions.values())
    
    if useCase:
        q_list = [q for q in q_list if q.useCase.lower() == useCase.lower()]
    if difficulty:
        q_list = [q for q in q_list if q.difficulty.lower() == difficulty.lower()]
    if search:
        s_lower = search.lower()
        q_list = [q for q in q_list if s_lower in q.title.lower() or s_lower in q.description.lower()]
        
    return q_list

@router.get("/questions/{question_id}", response_model=Question)
def get_question(question_id: str):
    q = assessment_store.questions.get(question_id)
    if not q:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found")
    return q

@router.post("/run-code", response_model=CodeExecutionResponse)
def run_code_api(req: RunCodeRequest):
    """
    4. In the code editor no input is mentioned.
    5. Once code is entered by user, verify and run against public & hidden test cases.
    """
    q = assessment_store.questions.get(req.questionId)
    if not q:
        raise HTTPException(status_code=404, detail=f"Question {req.questionId} not found")
        
    result = execute_code_submission(
        code=req.code,
        function_name=q.functionName,
        test_cases=q.testCases
    )
    return result

@router.post("/submit", response_model=AssessmentReportItem)
def submit_solution_api(req: SubmitSolutionRequest):
    """
    Submit code solution, record time consumed, evaluate all test cases, and log report.
    """
    try:
        report = assessment_store.add_submission(req)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/reports", response_model=List[AssessmentReportItem])
def get_admin_reports():
    """
    6. Admin portal report containing:
       - Question (Title, Hint, Use Case, Difficulty)
       - Answers (Candidate's code solution)
       - Time Consuming (Duration taken)
       - Evaluations (Pass/Fail rate, runtime, feedback)
    """
    return assessment_store.reports

@router.get("/rf-metrics")
def get_rf_model_metrics():
    """
    Random Forest model stats, feature importances, and distribution across use cases.
    """
    return rf_classifier.get_metrics()
