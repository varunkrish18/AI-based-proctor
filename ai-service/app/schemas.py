from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class FrameAnalysisRequest(BaseModel):
    sessionId: Optional[int] = None
    frame: str = Field(..., description="Base64 encoded JPEG or PNG image")
    timestamp: Optional[datetime] = None


class HeadPose(BaseModel):
    yaw: float = Field(..., description="Yaw angle in degrees (negative: left, positive: right)")
    pitch: float = Field(..., description="Pitch angle in degrees (negative: down, positive: up)")
    roll: float = Field(..., description="Roll angle in degrees (head tilt)")


class EventItem(BaseModel):
    type: str
    confidence: float
    metadata: Optional[Dict[str, Any]] = None


class FrameAnalysisResponse(BaseModel):
    faceDetected: bool
    faceCount: int
    confidence: float
    phoneDetected: bool = False
    objectDetected: bool = False
    detectedObjects: List[str] = Field(default_factory=list)
    personBehindDetected: bool = False
    gazeDirection: str = Field(
        default="CENTER",
        description="CENTER, LEFT, RIGHT, UP, or DOWN"
    )
    headPose: Optional[HeadPose] = None
    events: List[EventItem] = Field(default_factory=list)
    modelVersion: str = Field(default="heuristic-v1", description="Model version/pipeline identifier")

