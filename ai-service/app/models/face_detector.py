"""
Face Detection & Analysis Module.
Primary backend: OpenCV Haar Cascade (works out of box, no model download needed).
Upgrade path: When MediaPipe Task model files are available, set MEDIAPIPE_MODEL_PATH
in environment and this module will auto-prefer them for better accuracy.

Phase 4: Face detection + multi-face count
Phase 5: Head pose via solvePnP + iris-based gaze classification
"""

import base64
import os
from pathlib import Path
import cv2
import numpy as np
from typing import Tuple, Optional, List

from app.config import (
    FACE_DETECTION_CONFIDENCE,
    PHONE_DETECTION_CONFIDENCE,
    OBJECT_DETECTION_CONFIDENCE,
    PROHIBITED_OBJECT_CATEGORIES,
    YAW_LOOK_AWAY_DEG,
    YAW_HEAD_TURNED_DEG,
    PITCH_LOOK_DOWN_DEG,
    PITCH_LOOK_UP_DEG,
    IRIS_HORIZONTAL_RIGHT_RATIO,
    IRIS_HORIZONTAL_LEFT_RATIO,
    IRIS_VERTICAL_DOWN_RATIO,
    IRIS_VERTICAL_UP_RATIO,
)
from app.schemas import FrameAnalysisResponse, HeadPose, EventItem
from app.models.onnx_classifier import classifier

# ---------------------------------------------------------------------------
# Model file paths (Absolute resolution relative to this file)
# ---------------------------------------------------------------------------
MODELS_DIR = Path(__file__).resolve().parent
FACE_DETECTOR_MODEL = MODELS_DIR / "face_detector.task"
FACE_LANDMARKER_MODEL = MODELS_DIR / "face_landmarker.task"
OBJECT_DETECTOR_MODEL = MODELS_DIR / "efficientdet_lite0.tflite"

# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

_haar_cascade: Optional[cv2.CascadeClassifier] = None
_mp_face_detector = None        # mediapipe Tasks FaceDetector (optional)
_mp_face_landmarker = None      # mediapipe Tasks FaceLandmarker (optional)
_mp_object_detector = None      # mediapipe Tasks ObjectDetector (for mobile/phone detection)
_mp_init_attempted = False      # only attempt once


def _get_haar_cascade() -> cv2.CascadeClassifier:
    """
    Load Haar cascade, preferring the XML bundled in app/data/ (works with
    opencv-python-headless which does not ship cascade files).
    Falls back to cv2.data.haarcascades for full opencv-python installs.
    """
    global _haar_cascade
    if _haar_cascade is None:
        # Primary: bundled alongside this package (works with headless opencv)
        bundled = MODELS_DIR.parent / "data" / "haarcascade_frontalface_default.xml"
        if bundled.exists():
            cascade_path = str(bundled)
        else:
            # Fallback: full opencv-python install path
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cc = cv2.CascadeClassifier(cascade_path)
        if cc.empty():
            raise RuntimeError(f"Failed to load Haar cascade from: {cascade_path}")
        _haar_cascade = cc
    return _haar_cascade


def _try_init_mediapipe():
    """
    Attempt to initialise MediaPipe Tasks FaceDetector and FaceLandmarker.
    Uses absolute Path(__file__) resolution so models load reliably in any Docker/Proxmox working directory.
    """
    global _mp_face_detector, _mp_face_landmarker, _mp_object_detector, _mp_init_attempted
    _mp_init_attempted = True

    detector_model_path = os.environ.get(
        "MEDIAPIPE_FACE_DETECTOR_MODEL",
        str(FACE_DETECTOR_MODEL)
    )
    landmarker_model_path = os.environ.get(
        "MEDIAPIPE_FACE_LANDMARKER_MODEL",
        str(FACE_LANDMARKER_MODEL)
    )
    obj_model_path = os.environ.get(
        "MEDIAPIPE_OBJECT_DETECTOR_MODEL",
        str(OBJECT_DETECTOR_MODEL)
    )

    if not os.path.exists(detector_model_path):
        # Model files not present; stay on Haar
        return

    try:
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        det_opts = mp_vision.FaceDetectorOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(detector_model_path)),
            min_detection_confidence=FACE_DETECTION_CONFIDENCE
        )
        _mp_face_detector = mp_vision.FaceDetector.create_from_options(det_opts)
        print("[INFO] MediaPipe Tasks FaceDetector initialised.")

        if os.path.exists(landmarker_model_path):
            lmk_opts = mp_vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(landmarker_model_path)),
                # One landmark pass supplies both gaze data and multi-face count.
                # This avoids a separate face-detector inference for normal frames.
                num_faces=2,
                min_face_detection_confidence=0.5,
                min_tracking_confidence=0.5,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False,
            )
            _mp_face_landmarker = mp_vision.FaceLandmarker.create_from_options(lmk_opts)
            print("[INFO] MediaPipe Tasks FaceLandmarker initialised.")

        if os.path.exists(obj_model_path):
            obj_opts = mp_vision.ObjectDetectorOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(obj_model_path)),
                score_threshold=OBJECT_DETECTION_CONFIDENCE,
                category_allowlist=None  # Scan for all objects including person, phone, book, laptop, etc.
            )
            _mp_object_detector = mp_vision.ObjectDetector.create_from_options(obj_opts)
            print(f"[INFO] MediaPipe Tasks ObjectDetector initialised (threshold={OBJECT_DETECTION_CONFIDENCE}, all categories).")

    except Exception as e:
        print(f"[WARN] MediaPipe Tasks init failed (falling back to Haar): {e}")
        _mp_face_detector = None
        _mp_face_landmarker = None
        _mp_object_detector = None


# ---------------------------------------------------------------------------
# 3D head pose via solvePnP
# ---------------------------------------------------------------------------

# Calibrated 3D anthropometric face model points (mm) relative to nose tip:
# Standard OpenCV camera coordinates: X right (+), Y down (+), Z away (-)
# Balanced so that a user sitting naturally looking at their screen/webcam has pitch ~ 0.0 deg.
MODEL_POINTS_3D = np.array([
    (0.0,    0.0,    0.0),       # 1: Nose tip
    (0.0,    65.0,  -25.0),      # 152: Chin (down 65mm, back 25mm)
    (-65.0, -45.0,  -30.0),      # 33: Right eye outer corner (image left)
    (65.0,  -45.0,  -30.0),      # 263: Left eye outer corner (image right)
    (-40.0,  40.0,  -25.0),      # 61: Right mouth corner (image left)
    (40.0,   40.0,  -25.0),      # 291: Left mouth corner (image right)
], dtype=np.float64)


def decode_base64_image(base64_str: str) -> Optional[np.ndarray]:
    """Decodes a base64 or data-URL encoded image to an OpenCV BGR image."""
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]
        image_bytes = base64.b64decode(base64_str)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def calculate_head_pose(landmarks, img_w: int, img_h: int) -> Optional[Tuple[float, float, float]]:
    """Computes yaw/pitch/roll (degrees) from 6 facial landmarks via solvePnP."""
    try:
        image_points = np.array([
            (landmarks[1].x  * img_w, landmarks[1].y  * img_h),
            (landmarks[152].x * img_w, landmarks[152].y * img_h),
            (landmarks[33].x  * img_w, landmarks[33].y  * img_h),
            (landmarks[263].x * img_w, landmarks[263].y * img_h),
            (landmarks[61].x  * img_w, landmarks[61].y  * img_h),
            (landmarks[291].x * img_w, landmarks[291].y * img_h),
        ], dtype=np.float64)

        focal_length = float(img_w)
        center = (img_w / 2.0, img_h / 2.0)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1))

        success, rvec, _ = cv2.solvePnP(
            MODEL_POINTS_3D, image_points, camera_matrix, dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE
        )
        if not success:
            return None

        rmat, _ = cv2.Rodrigues(rvec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
        return round(float(angles[1]), 1), round(float(angles[0]), 1), round(float(angles[2]), 1)  # yaw, pitch, roll
    except Exception:
        return None


def classify_gaze(landmarks, yaw: float, pitch: float) -> str:
    """
    Returns CENTER / LEFT / RIGHT / UP / DOWN based on head pose + dual-eye iris position.
    Calibrated for professional exam proctoring:
    - Looking directly at screen or reading exam questions is strictly CENTER.
    - Looking UP detects head tilting up (pitch > 18 deg) or iris rolled upwards.
    - Looking DOWN detects head tilting down (pitch < -18 deg) or sustained eye glance down at desk/lap/phone.
    - Looking LEFT/RIGHT detects head turn (yaw > 22 deg or < -22 deg) or strong lateral iris glances.
    """
    # 1. Distinct head turn left or right
    if yaw < -YAW_LOOK_AWAY_DEG:
        return "LEFT"
    if yaw > YAW_LOOK_AWAY_DEG:
        return "RIGHT"

    # Extract iris gaze ratios if iris landmarks are present
    avg_v_ratio = None
    avg_h_ratio = None
    if len(landmarks) > 473:
        try:
            # Vertical gaze tracking across both eyes (eyelids vs pupil center)
            # Right eye: top 159, bottom 145, iris 468
            # Left eye: top 386, bottom 374, iris 473
            l_top = landmarks[159].y
            l_bot = landmarks[145].y
            l_iris_y = landmarks[468].y
            l_height = abs(l_bot - l_top)

            r_top = landmarks[386].y
            r_bot = landmarks[374].y
            r_iris_y = landmarks[473].y
            r_height = abs(r_bot - r_top)

            v_ratios = []
            if l_height > 0.005:
                v_ratios.append((l_iris_y - min(l_top, l_bot)) / l_height)
            if r_height > 0.005:
                v_ratios.append((r_iris_y - min(r_top, r_bot)) / r_height)
            if v_ratios:
                avg_v_ratio = sum(v_ratios) / len(v_ratios)

            # Horizontal gaze tracking across both eyes:
            # Right eye (image left): outer 33, inner 133, iris 468
            # Left eye (image right): inner 362, outer 263, iris 473
            h_ratios = []
            right_outer = landmarks[33].x
            right_inner = landmarks[133].x
            right_iris  = landmarks[468].x
            r_width = abs(right_inner - right_outer)
            if r_width > 0.004:
                h_ratios.append((right_iris - min(right_outer, right_inner)) / r_width)

            left_inner = landmarks[362].x
            left_outer = landmarks[263].x
            left_iris  = landmarks[473].x
            l_width = abs(left_outer - left_inner)
            if l_width > 0.004:
                h_ratios.append((left_iris - min(left_inner, left_outer)) / l_width)

            if h_ratios:
                avg_h_ratio = sum(h_ratios) / len(h_ratios)
        except Exception:
            pass

    # 2. Horizontal iris glance while head is facing forward
    if avg_h_ratio is not None:
        if avg_h_ratio < IRIS_HORIZONTAL_RIGHT_RATIO:
            return "RIGHT"
        elif avg_h_ratio > IRIS_HORIZONTAL_LEFT_RATIO:
            return "LEFT"

    # 3. Head pitch thresholds
    if pitch > PITCH_LOOK_UP_DEG:
        return "UP"
    if pitch < -PITCH_LOOK_DOWN_DEG:
        return "DOWN"

    # 4. Compound Vertical Gaze (Pitch + Iris synergy):
    if avg_v_ratio is not None:
        # Looking DOWN at desk/lap/phone:
        if (pitch <= -12.0 and avg_v_ratio > 0.60) or (avg_v_ratio > IRIS_VERTICAL_DOWN_RATIO and pitch <= 2.0):
            return "DOWN"

        # Looking UP at ceiling:
        if (pitch >= 12.0 and avg_v_ratio < 0.28) or (avg_v_ratio < IRIS_VERTICAL_UP_RATIO and pitch >= -2.0):
            return "UP"

    return "CENTER"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def analyze_frame(base64_frame: str) -> FrameAnalysisResponse:
    """
    Stateless analysis of one video frame.
    Returns face presence, count, head pose, gaze direction, and events.
    Falls back gracefully if any analysis step fails.
    """
    if not _mp_init_attempted:
        _try_init_mediapipe()

    img = decode_base64_image(base64_frame)
    if img is None:
        return _empty_response()

    h, w = img.shape[:2]
    events: List[EventItem] = []
    face_count = 0
    primary_confidence = 0.0
    landmark_result = None

    # One landmark inference provides the face count, iris landmarks, and pose
    # inputs. Only run the separate detector when landmark inference finds none.
    if _mp_face_landmarker is not None:
        try:
            import mediapipe as mp
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            landmark_result = _mp_face_landmarker.detect(mp_image)
            if landmark_result and landmark_result.face_landmarks:
                face_count = len(landmark_result.face_landmarks)
                primary_confidence = 0.90
        except Exception as e:
            print(f"[WARN] Landmarker error: {e}")

    if face_count == 0 and _mp_face_detector is not None:
        try:
            import mediapipe as mp
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            result = _mp_face_detector.detect(mp_image)
            if result and result.detections:
                face_count = len(result.detections)
                primary_confidence = float(result.detections[0].categories[0].score)
        except Exception as e:
            print(f"[WARN] Face detector error: {e}")
    elif face_count == 0:
        try:
            cascade = _get_haar_cascade()
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(40, 40))
            face_count = len(faces)
            primary_confidence = 0.85 if face_count > 0 else 0.0
        except Exception as e:
            print(f"[WARN] Haar detection error: {e}")

    person_behind_detected = False
    object_detected = False
    detected_objects: List[str] = []
    phone_detected = False

    face_detected = face_count > 0

    # Camera occlusion / covered lens detection
    camera_covered = False
    gray_for_check = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean_brightness = float(np.mean(gray_for_check))
    std_brightness = float(np.std(gray_for_check))
    laplacian_var = float(cv2.Laplacian(gray_for_check, cv2.CV_64F).var())

    if not face_detected:
        # 1. Very dark / pitch black / hand or object covering lens (mean brightness < 25.0)
        # 2. Hand/finger pressed firmly against lens in ambient light (mean < 45.0, low contrast, no edges)
        # 3. Solid uniform color / paper / tape blocking lens (extremely low std dev & laplacian)
        is_dark_occluded = mean_brightness < 25.0
        is_hand_occluded = (mean_brightness < 45.0 and std_brightness < 12.0 and laplacian_var < 15.0)
        is_uniform_occluded = (std_brightness < 6.0 and laplacian_var < 10.0)

        if is_dark_occluded or is_hand_occluded or is_uniform_occluded:
            camera_covered = True
            events.append(EventItem(
                type="CAMERA_COVERED",
                confidence=0.95,
                metadata={
                    "mean_brightness": round(mean_brightness, 1),
                    "std_brightness": round(std_brightness, 1),
                    "laplacian_var": round(laplacian_var, 1),
                    "description": "Camera lens is covered or occluded"
                }
            ))
            events.append(EventItem(
                type="FACE_NOT_VISIBLE",
                confidence=0.95,
                metadata={"reason": "Face not visible due to camera occlusion"}
            ))
        else:
            events.append(EventItem(
                type="FACE_NOT_VISIBLE",
                confidence=0.90,
                metadata={"reason": "Candidate face not detected in webcam view"}
            ))

    if face_count > 1:
        person_behind_detected = True
        events.append(EventItem(
            type="PERSON_BEHIND_DETECTED",
            confidence=round(primary_confidence, 2),
            metadata={"faceCount": face_count, "description": "Multiple faces / person in background detected"}
        ))
        events.append(EventItem(type="MULTIPLE_FACES", confidence=round(primary_confidence, 2)))

    # ---- Phase 5: Head pose + Gaze  ---------------------------------------
    gaze_dir = "CENTER"
    head_pose_obj: Optional[HeadPose] = None

    if face_detected and landmark_result and landmark_result.face_landmarks:
        try:
            if landmark_result.face_landmarks:
                lms = landmark_result.face_landmarks[0]
                pose = calculate_head_pose(lms, w, h)

                # Iris landmarks are independent of solvePnP.  Keep gaze tracking
                # active even when head-pose calibration cannot be calculated for a
                # particular frame, using neutral pose angles in that fallback.
                yaw = pitch = roll = 0.0
                if pose:
                    yaw, pitch, roll = pose
                    head_pose_obj = HeadPose(yaw=yaw, pitch=pitch, roll=roll)

                    if abs(yaw) >= YAW_HEAD_TURNED_DEG:
                        events.append(EventItem(
                            type="HEAD_TURNED",
                            confidence=0.90,
                            metadata={"yaw": yaw, "pitch": pitch}
                        ))

                gaze_dir = classify_gaze(lms, yaw, pitch)
        except Exception as e:
            print(f"[WARN] Landmarker error: {e}")

    model_ver = "heuristic-v1"
    if classifier.is_available() and head_pose_obj is not None:
        model_ver = "onnx-v1"
        try:
            gaze_map = {"CENTER": 0.0, "LEFT": 1.0, "RIGHT": 2.0, "UP": 3.0, "DOWN": 4.0}
            feat = [
                head_pose_obj.yaw,
                head_pose_obj.pitch,
                head_pose_obj.roll,
                gaze_map.get(gaze_dir, 0.0),
                float(face_count),
                float(primary_confidence)
            ]
            pred_label, pred_conf = classifier.classify(feat)
            if pred_label != "NORMAL" and pred_conf >= 0.5:
                events.append(EventItem(
                    type=pred_label,
                    confidence=round(pred_conf, 2),
                    metadata={"source": "onnx", "version": "onnx-v1"}
                ))
        except Exception as e:
            print(f"[WARN] ONNX inference error: {e}")

    # ---- Phase 5b: Object & Secondary Person Detection --------------------
    if _mp_object_detector is not None:
        try:
            import mediapipe as mp
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            obj_result = _mp_object_detector.detect(mp_image)
            if obj_result and obj_result.detections:
                person_count_obj = 0
                for det in obj_result.detections:
                    bbox = det.bounding_box
                    box_w = bbox.width
                    box_h = bbox.height
                    box_area = (box_w * box_h) / float(w * h)

                    for cat in det.categories:
                        score = float(cat.score)
                        cname = cat.category_name.lower()

                        if cname == "person":
                            if score >= 0.40:
                                person_count_obj += 1
                            continue

                        # Filter noise
                        if score < OBJECT_DETECTION_CONFIDENCE:
                            continue
                        if box_area < 0.008 or box_area > 0.70:
                            continue

                        # Check if phone
                        if "phone" in cname or "cell" in cname:
                            phone_detected = True
                            object_detected = True
                            if "cell phone" not in detected_objects:
                                detected_objects.append("cell phone")
                            events.append(EventItem(
                                type="CELL_PHONE_DETECTED",
                                confidence=round(score, 2),
                                metadata={"object": cat.category_name, "score": round(score, 2)}
                            ))
                        elif any(proh in cname for proh in PROHIBITED_OBJECT_CATEGORIES) or cname in ["book", "laptop", "remote", "tv", "tablet", "mouse", "keyboard"]:
                            object_detected = True
                            if cname not in detected_objects:
                                detected_objects.append(cname)
                            events.append(EventItem(
                                type="OBJECT_DETECTED",
                                confidence=round(score, 2),
                                metadata={"object": cat.category_name, "score": round(score, 2)}
                            ))
                            if "book" in cname:
                                events.append(EventItem(
                                    type="PROHIBITED_OBJECT_DETECTED",
                                    confidence=round(score, 2),
                                    metadata={"object": cat.category_name, "score": round(score, 2)}
                                ))

                if person_count_obj > 1 and not person_behind_detected:
                    person_behind_detected = True
                    events.append(EventItem(
                        type="PERSON_BEHIND_DETECTED",
                        confidence=0.85,
                        metadata={"personCount": person_count_obj, "description": "Multiple persons detected in background"}
                    ))
        except Exception as e:
            print(f"[WARN] Object detector error: {e}")

    return FrameAnalysisResponse(
        faceDetected=face_detected,
        faceCount=face_count,
        confidence=round(primary_confidence, 2),
        phoneDetected=phone_detected,
        objectDetected=object_detected,
        detectedObjects=detected_objects,
        personBehindDetected=person_behind_detected,
        cameraCovered=camera_covered,
        gazeDirection=gaze_dir,
        headPose=head_pose_obj,
        events=events,
        modelVersion=model_ver
    )


def _empty_response() -> FrameAnalysisResponse:
    return FrameAnalysisResponse(
        faceDetected=False,
        faceCount=0,
        confidence=0.0,
        phoneDetected=False,
        objectDetected=False,
        detectedObjects=[],
        personBehindDetected=False,
        cameraCovered=True,
        gazeDirection="CENTER",
        headPose=None,
        events=[
            EventItem(type="CAMERA_COVERED", confidence=1.0, metadata={"reason": "Empty or unreadable video frame"}),
            EventItem(type="FACE_NOT_VISIBLE", confidence=1.0, metadata={"reason": "No video frame data"})
        ],
        modelVersion="heuristic-v1"
    )



def get_capabilities() -> dict:
    """
    Returns a capability snapshot for the /health endpoint.
    Tells the admin dashboard which analysis features are currently active.
    """
    global _mp_init_attempted
    if not _mp_init_attempted:
        _try_init_mediapipe()

    gaze_enabled = _mp_face_landmarker is not None
    face_backend = "mediapipe" if _mp_face_detector is not None else "haar-cascade"
    model_version = "onnx-v1" if classifier.is_available() else "heuristic-v1"

    return {
        "gaze_enabled": gaze_enabled,
        "iris_gaze_enabled": gaze_enabled,
        "head_pose_enabled": gaze_enabled,
        "phone_detection_enabled": _mp_object_detector is not None,
        "camera_occlusion_enabled": True,
        "multi_face_enabled": True,
        "face_backend": face_backend,
        "model_version": model_version,
        "degraded_mode": not gaze_enabled,
    }
