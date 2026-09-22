from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import time

from app.schemas import FrameAnalysisRequest, FrameAnalysisResponse
from app.models.face_detector import analyze_frame, get_capabilities

app = FastAPI(
    title="AI Proctoring Service",
    description="Stateless computer-vision analysis service for face presence, multi-face detection, head pose, and gaze direction.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        "message": "AI Online Examination Proctoring Service (Phases 4 & 5)",
        "docs": "/docs"
    }


@app.post("/v1/analyze/frame", response_model=FrameAnalysisResponse)
def analyze_webcam_frame(req: FrameAnalysisRequest):
    """
    Stateless frame analysis endpoint.
    Takes a base64 encoded frame and returns face counts, confidence, gaze direction, and head pose.
    """
    if not req.frame:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Frame data cannot be empty"
        )

    try:
        result = analyze_frame(req.frame)
        return result
    except Exception as e:
        # Never crash or raise 500 unhandled; return graceful response
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
