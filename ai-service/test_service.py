import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient
from app.main import app
import numpy as np
import cv2
import base64

client = TestClient(app, raise_server_exceptions=False)


def test_health():
    res = client.get("/health")
    data = res.json()
    print("  [health] %d -> %s" % (res.status_code, data))
    assert res.status_code == 200
    assert data.get("status") == "UP", "Expected UP, got %s" % data.get("status")
    print("  PASSED: Health check")


def test_blank_frame():
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

    res = client.post("/v1/analyze/frame", json={"frame": b64, "timestamp": "2026-09-20T10:00:00Z"})
    data = res.json()
    print("  [blank frame] %d -> %s" % (res.status_code, data))
    assert res.status_code == 200
    assert data["faceDetected"] is False
    assert data["faceCount"] == 0
    assert "gazeDirection" in data
    print("  PASSED: Blank frame (no face detected)")


def test_response_shape():
    noise = np.random.randint(0, 255, (240, 320, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", noise)
    b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

    res = client.post("/v1/analyze/frame", json={"frame": b64})
    data = res.json()
    print("  [noise frame] %d -> %s" % (res.status_code, data))
    assert res.status_code == 200
    for field in ["faceDetected", "faceCount", "gazeDirection", "confidence"]:
        assert field in data, "Missing field: %s" % field
    print("  PASSED: Response schema is complete")


if __name__ == "__main__":
    print("\n=== AI Service Unit Tests ===\n")
    test_health()
    test_blank_frame()
    test_response_shape()
    print("\nALL TESTS PASSED SUCCESSFULLY!")
