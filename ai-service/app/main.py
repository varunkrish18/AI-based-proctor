from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import time

from app.schemas import FrameAnalysisRequest, FrameAnalysisResponse
from app.models.face_detector import analyze_frame, get_capabilities
from app.assessment_routes import router as assessment_router

app = FastAPI(
    title="AI Proctoring & Assessment Service",
    description="Stateless computer-vision analysis & AI-driven coding assessment platform with Random Forest use-case classification and isolated code execution.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register assessment engine routes
app.include_router(assessment_router)

@app.on_event("startup")
def startup_event():
    # Warm up models on server start so initial requests don't hit model loading latency
    get_capabilities()

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    caps = get_capabilities()
    return {
        "status": "UP",
        "service": "ai-service",
        "timestamp": time.time(),
        "capabilities": caps,
        "degraded_mode": caps["degraded_mode"],
        "degraded_reason": "MediaPipe model files not found; gaze/head-pose detection unavailable. Running face-count only via Haar Cascade." if caps["degraded_mode"] else None,
    }

@app.get("/")
def root():
    return {
        "message": "AI Online Examination Proctoring & Coding Assessment Service",
        "docs": "/docs",
        "assessment_endpoints": {
            "generate": "/v1/assessment/generate",
            "questions": "/v1/assessment/questions",
            "run_code": "/v1/assessment/run-code",
            "submit": "/v1/assessment/submit",
            "reports": "/v1/assessment/reports",
            "rf_metrics": "/v1/assessment/rf-metrics"
        }
    }

@app.post("/v1/analyze/frame", response_model=FrameAnalysisResponse)
def analyze_webcam_frame(req: FrameAnalysisRequest):
    if not req.frame:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Frame data cannot be empty"
        )

    try:
        result = analyze_frame(req.frame)
        return result
    except Exception as e:
        print(f"[ERROR] Frame analysis failed: {e}")
        return FrameAnalysisResponse(
            faceDetected=False,
            faceCount=0,
            confidence=0.0,
            gazeDirection="CENTER",
            headPose=None,
            events=[]
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
